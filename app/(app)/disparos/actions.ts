"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { listActiveGroups } from "@/lib/db/communities";
import { listAssets } from "@/lib/db/assets";
import { publicAssetUrl } from "@/lib/campaign-pieces";
import { getEvolutionConfig } from "@/lib/evolution/config";
import { evoConnect, evoConnectionState, evoListGroups, evoLogout } from "@/lib/evolution/client";
import { assessSyncRisk, planCommunitySync, type SyncableCommunity } from "@/lib/evolution/sync";
import type { EvoConnectionState, EvoQrCode } from "@/lib/evolution/types";
import { buildSendPayload } from "@/lib/sends/payload";
import { isPast, planSends, validateSchedulable, type ScheduleIssue } from "@/lib/sends/plan";
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

/**
 * Solta o número e deixa a fila parada.
 *
 * A pausa vem ANTES do logout de propósito. Se o logout falhar, o sistema fica pausado
 * e conectado — chato, e um clique conserta. Na ordem inversa, uma falha ao pausar
 * deixaria a fila tentando entregar com o número fora do ar, queimando as 3 tentativas
 * de cada linha (1, 3 e 9 min) até virar falha definitiva.
 *
 * Retomar é sempre manual: a fila não volta a andar antes de alguém conferir que os
 * grupos sincronizaram certo com o número novo.
 *
 * Não devolve o estado pós-logout: ninguém usava — o `router.refresh()` do chamador já
 * faz o servidor recalcular o estado real em `page.tsx`. Uma segunda chamada à Evolution
 * aqui só somava até 20s de timeout ao desconectar, e um soluço dela bem depois de um
 * logout bem-sucedido viraria erro cru na tela por causa de uma leitura que ninguém pediu.
 */
export async function disconnectNumberAction(): Promise<void> {
  const cfg = getEvolutionConfig(process.env);

  await setPauseAction(true, "Troca de número");
  await evoLogout(cfg);

  // Aposenta os grupos do número que saiu: eles pertencem a ESTE número (só há uma
  // instância por vez). Desativa (não apaga, não mexe no enabled) — somem da lista, o
  // histórico fica, e reconectar o MESMO número + sincronizar os traz de volta.
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("communities")
    .update({ active: false })
    .not("wa_group_id", "is", null)
    .eq("active", true);
  if (error) throw new Error(`Falha ao aposentar os grupos do número: ${error.message}`);

  revalidateAll();
}

export type SyncResult =
  | { ok: true; inserted: number; linked: number; deactivated: number }
  | {
      ok: false;
      needsConfirm: true;
      reason: "empty" | "mass";
      deactivating: number;
      total: number;
    };

export async function syncGroupsAction(confirmed: boolean = false): Promise<SyncResult> {
  const groups = await evoListGroups(getEvolutionConfig(process.env));

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("communities")
    .select("id, name, identifier, wa_group_id, wa_subject, active");
  if (error) throw new Error(`Falha ao carregar comunidades: ${error.message}`);

  const existing = (data ?? []) as SyncableCommunity[];
  const plan = planCommunitySync(existing, groups);

  // Nenhuma escrita acontece antes desta avaliação.
  const risk = assessSyncRisk(plan, existing, groups.length);

  // `empty` e `mass` são a mesma trava (desativação em massa) com o mesmo caminho de
  // saída: confirmar. Duas variantes de erro para o mesmo tipo de desfecho obrigariam
  // duas coisas ruins — um `throw` sem bypass (o `empty` original) e mensagens de Server
  // Action que o Next ofusca em produção. Unificado na própria união de `SyncResult`,
  // que já existe para o `mass`.
  if (risk.kind !== "ok" && !confirmed) {
    return {
      ok: false,
      needsConfirm: true,
      reason: risk.kind,
      deactivating: risk.kind === "empty" ? plan.deactivate.length : risk.deactivating,
      total: risk.total,
    };
  }

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
    ok: true,
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
  const { data, error } = await supabase
    .from("app_settings")
    .update({
      sends_paused: paused,
      paused_reason: reason.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", true)
    .select("id");
  if (error) throw new Error(`Falha ao alterar a pausa: ${error.message}`);
  // Um UPDATE que não casa nenhuma linha volta sem erro — e aqui isso significaria a
  // pausa "aplicada" só na tela, nunca no banco. Como o desconectar solta o número logo
  // em seguida assumindo que a pausa já pegou, esse é o único ponto que prova isso antes
  // do passo que não tem volta.
  if (!data || data.length === 0) {
    throw new Error("Falha ao alterar a pausa: nenhuma linha de configuração foi encontrada.");
  }
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
 * Dispensa uma falha ou expirado do bloco de atenção sem reenviar: vira `cancelado`
 * e sai da Fila para o Histórico. É como você diz "já resolvi / deixa pra lá" e limpa
 * a lista do que ainda pede decisão.
 */
export async function dismissSendAction(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("scheduled_sends")
    .update({ status: "cancelado" })
    .eq("id", id)
    .in("status", ["falhou", "expirado"]);
  if (error) throw new Error(`Falha ao dispensar envio: ${error.message}`);
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
  /** Gerar o card de prévia do link. Desligado por padrão. */
  linkPreview: boolean;
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
    payload: buildSendPayload(input.text, asset, publicAssetUrl, input.linkPreview),
    targets: input.communityIds.flatMap((id) => {
      const g = groupById.get(id);
      return g?.wa_group_id
        ? [{ community_id: g.id, wa_group_id: g.wa_group_id, wa_subject: g.wa_subject }]
        : [];
    }),
  };

  const issues = validateSchedulable([piece], { allowImmediate: true });

  // Nada é agendado para trás. Se a intenção era mandar já, o botão é "Agora".
  if (piece.send_at && isPast(piece.send_at, new Date())) {
    issues.push({
      post_id: null,
      label: "Disparo rápido",
      message: "Essa data já passou. Escolha um horário no futuro ou clique em Agora.",
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
