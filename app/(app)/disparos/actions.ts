"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { listActiveGroups } from "@/lib/db/communities";
import { listAssets } from "@/lib/db/assets";
import { publicAssetUrl } from "@/lib/campaign-pieces";
import { getEvolutionConfig } from "@/lib/evolution/config";
import { evoConnect, evoConnectionState, evoListGroups } from "@/lib/evolution/client";
import { planCommunitySync, type SyncableCommunity } from "@/lib/evolution/sync";
import type { EvoConnectionState, EvoQrCode } from "@/lib/evolution/types";
import { buildSendPayload } from "@/lib/sends/payload";
import { isStale, planSends, validateSchedulable, type ScheduleIssue } from "@/lib/sends/plan";
import { dispatchDue } from "@/lib/sends/dispatch";

function revalidateAll() {
  revalidatePath("/disparos");
  revalidatePath("/campanhas");
}

// ---------------------------------------------------------------------------
// Conexão
// ---------------------------------------------------------------------------

export async function fetchQrCodeAction(): Promise<EvoQrCode> {
  return evoConnect(getEvolutionConfig(process.env));
}

export async function refreshStateAction(): Promise<{ state: EvoConnectionState }> {
  return { state: await evoConnectionState(getEvolutionConfig(process.env)) };
}

export type SyncResult = { inserted: number; linked: number; deactivated: number };

export async function syncGroupsAction(): Promise<SyncResult> {
  const groups = await evoListGroups(getEvolutionConfig(process.env));

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("communities")
    .select("id, name, identifier, wa_group_id, wa_subject, active");
  if (error) throw new Error(`Falha ao carregar comunidades: ${error.message}`);

  const plan = planCommunitySync((data ?? []) as SyncableCommunity[], groups);
  const syncedAt = new Date().toISOString();

  if (plan.insert.length) {
    const rows = plan.insert.map((row) => ({ ...row, sort_order: 99, synced_at: syncedAt }));
    const { error: e } = await supabase.from("communities").insert(rows);
    if (e) throw new Error(`Falha ao inserir grupos: ${e.message}`);
  }

  for (const row of plan.update) {
    const { id, ...fields } = row;
    const { error: e } = await supabase
      .from("communities")
      .update({ ...fields, synced_at: syncedAt })
      .eq("id", id);
    if (e) throw new Error(`Falha ao atualizar grupo: ${e.message}`);
  }

  if (plan.deactivate.length) {
    const { error: e } = await supabase
      .from("communities")
      .update({ active: false, synced_at: syncedAt })
      .in("id", plan.deactivate);
    if (e) throw new Error(`Falha ao desativar grupos: ${e.message}`);
  }

  revalidateAll();
  return {
    inserted: plan.insert.length,
    linked: plan.update.length,
    deactivated: plan.deactivate.length,
  };
}

/**
 * Habilita ou desabilita grupos para uso na ferramenta.
 *
 * Mexe só em `enabled` — nunca em `active`, que pertence à sincronização. Um grupo
 * desabilitado continua sincronizado; só deixa de ser um alvo possível.
 */
export async function setGroupsEnabledAction(ids: string[], enabled: boolean): Promise<void> {
  if (ids.length === 0) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("communities").update({ enabled }).in("id", ids);
  if (error) throw new Error(`Falha ao alterar os grupos: ${error.message}`);
  revalidateAll();
}

// ---------------------------------------------------------------------------
// A fila
// ---------------------------------------------------------------------------

/** O botão de pânico. A flag é checada dentro do claim — nada é entregue com ela ligada. */
export async function setPauseAction(paused: boolean, reason: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("app_settings")
    .update({
      sends_paused: paused,
      paused_reason: reason.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) throw new Error(`Falha ao alterar a pausa: ${error.message}`);
  revalidatePath("/disparos");
}

/**
 * Os updates abaixo travam no status esperado (`.eq("status", …)`) para não correr com
 * o worker: se ele reivindicou a linha entre o clique e a escrita, o update não pega.
 */
export async function cancelSendAction(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("scheduled_sends")
    .update({ status: "cancelado" })
    .eq("id", id)
    .eq("status", "pendente");
  if (error) throw new Error(`Falha ao cancelar envio: ${error.message}`);
  revalidatePath("/disparos");
}

export async function retrySendAction(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("scheduled_sends")
    .update({
      status: "pendente",
      attempts: 0,
      next_attempt_at: null,
      last_error: "",
      scheduled_at: new Date().toISOString(),
    })
    .eq("id", id)
    // Reenviar um expirado é decisão consciente: a mensagem está atrasada e você sabe.
    .in("status", ["falhou", "cancelado", "expirado"]);
  if (error) throw new Error(`Falha ao reenviar: ${error.message}`);
  revalidatePath("/disparos");
}

/**
 * Linha presa em `enviando`: a função morreu entre chamar a Evolution e gravar o
 * resultado. A mensagem PODE ter saído — por isso o sistema nunca reprocessa sozinho.
 * Marca como falha e deixa a decisão de reenviar com quem conferiu o grupo.
 */
export async function unstickSendAction(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("scheduled_sends")
    .update({ status: "falhou", last_error: "Marcado manualmente: envio ficou preso." })
    .eq("id", id)
    .eq("status", "enviando");
  if (error) throw new Error(`Falha ao destravar envio: ${error.message}`);
  revalidatePath("/disparos");
}

// ---------------------------------------------------------------------------
// Disparo rápido
// ---------------------------------------------------------------------------

export type QuickSendInput = {
  text: string;
  assetId: string | null;
  communityIds: string[];
  /** "" = enviar agora. Senão "YYYY-MM-DD HH:mm" no horário de São Paulo. */
  sendAt: string;
};

export type QuickSendResult =
  | { ok: true; queued: number; sent: number; failed: number; immediate: boolean }
  | { ok: false; issues: ScheduleIssue[] };

/**
 * Disparo avulso: uma mensagem que não pertence a campanha nenhuma.
 *
 * Não precisa de tabela de conteúdo — a fila já congela texto e mídia no `payload`.
 * `campaign_id` e `post_id` ficam null, e por isso o claim considera estas linhas
 * sempre elegíveis: não há campanha para aprovar.
 */
export async function quickSendAction(input: QuickSendInput): Promise<QuickSendResult> {
  const [groups, assets] = await Promise.all([listActiveGroups(), listAssets()]);

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const asset = input.assetId ? (assets.find((a) => a.id === input.assetId) ?? null) : null;

  const piece = {
    post_id: null,
    label: "Disparo rápido",
    send_at: input.sendAt.trim(),
    payload: buildSendPayload(input.text, asset, publicAssetUrl),
    targets: input.communityIds.flatMap((id) => {
      const g = groupById.get(id);
      return g?.wa_group_id
        ? [{ community_id: g.id, wa_group_id: g.wa_group_id, wa_subject: g.wa_subject }]
        : [];
    }),
  };

  const issues = validateSchedulable([piece], { allowImmediate: true });

  // Agendar para o passado é sempre engano — a mensagem sairia em rajada, na hora.
  if (piece.send_at && isStale(piece.send_at, new Date())) {
    issues.push({
      post_id: null,
      label: "Disparo rápido",
      message: "Essa data já passou. Escolha um horário no futuro ou envie agora.",
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  const supabase = await createServerSupabase();
  const batchId = crypto.randomUUID();
  const rows = planSends([piece]).map((s) => ({ ...s, batch_id: batchId }));

  const { data: inserted, error } = await supabase
    .from("scheduled_sends")
    .insert(rows)
    .select("id");
  if (error) throw new Error(`Falha ao enfileirar disparo: ${error.message}`);

  revalidatePath("/disparos");

  const immediate = piece.send_at === "";
  if (!immediate) {
    return { ok: true, queued: rows.length, sent: 0, failed: 0, immediate: false };
  }

  // O despachante processa a fila inteira, não só o que acabei de inserir.
  const myIds = new Set((inserted ?? []).map((r) => r.id as string));
  const { results } = await dispatchDue();
  const mine = results.filter((r) => myIds.has(r.id));

  const sent = mine.filter((r) => r.ok).length;
  const failed = mine.filter((r) => !r.ok).length;

  return { ok: true, queued: Math.max(0, myIds.size - sent - failed), sent, failed, immediate: true };
}
