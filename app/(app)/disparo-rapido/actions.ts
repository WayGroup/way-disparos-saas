"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { listActiveGroups } from "@/lib/db/communities";
import { listAssets } from "@/lib/db/assets";
import { publicAssetUrl } from "@/lib/campaign-pieces";
import { buildSendPayload } from "@/lib/sends/payload";
import { planSends, validateSchedulable, type ScheduleIssue } from "@/lib/sends/plan";
import { dispatchDue } from "@/lib/sends/dispatch";

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
 * campaign_id e post_id ficam null, e por isso o claim considera estas linhas sempre
 * elegíveis (não há campanha para aprovar).
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

  // send_at vazio é válido aqui (= agora), então a validação de data só roda no agendado.
  const issues = validateSchedulable([piece]).filter(
    (i) => !(piece.send_at === "" && i.message.startsWith("Sem data")),
  );
  if (issues.length > 0) return { ok: false, issues };

  const supabase = await createServerSupabase();
  const batchId = crypto.randomUUID();
  const rows = planSends([piece]).map((s) => ({ ...s, batch_id: batchId }));

  const { data: inserted, error } = await supabase
    .from("scheduled_sends")
    .insert(rows)
    .select("id");
  if (error) throw new Error(`Falha ao enfileirar disparo: ${error.message}`);

  revalidatePath("/envios");

  const immediate = piece.send_at === "";
  if (!immediate) {
    return { ok: true, queued: rows.length, sent: 0, failed: 0, immediate: false };
  }

  const myIds = new Set((inserted ?? []).map((r) => r.id as string));
  const { results } = await dispatchDue();
  const mine = results.filter((r) => myIds.has(r.id));

  const sent = mine.filter((r) => r.ok).length;
  const failed = mine.filter((r) => !r.ok).length;

  return {
    ok: true,
    queued: Math.max(0, myIds.size - sent - failed),
    sent,
    failed,
    immediate: true,
  };
}
