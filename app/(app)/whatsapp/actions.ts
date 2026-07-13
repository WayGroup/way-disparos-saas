"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { getEvolutionConfig } from "@/lib/evolution/config";
import { evoConnect, evoConnectionState, evoListGroups } from "@/lib/evolution/client";
import { planCommunitySync, type SyncableCommunity } from "@/lib/evolution/sync";
import type { EvoConnectionState, EvoQrCode } from "@/lib/evolution/types";

export async function fetchQrCodeAction(): Promise<EvoQrCode> {
  const cfg = getEvolutionConfig(process.env);
  return evoConnect(cfg);
}

export async function refreshStateAction(): Promise<{ state: EvoConnectionState }> {
  const cfg = getEvolutionConfig(process.env);
  return { state: await evoConnectionState(cfg) };
}

/**
 * Habilita ou desabilita grupos para uso na ferramenta.
 *
 * Mexe só em `enabled` — nunca em `active`, que pertence à sincronização. Um grupo
 * desabilitado continua sincronizado; ele só deixa de aparecer como alvo possível.
 */
export async function setGroupsEnabledAction(ids: string[], enabled: boolean): Promise<void> {
  if (ids.length === 0) return;
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("communities").update({ enabled }).in("id", ids);
  if (error) throw new Error(`Falha ao alterar os grupos: ${error.message}`);
  revalidatePath("/whatsapp");
  revalidatePath("/disparo-rapido");
  revalidatePath("/campanhas");
}

export type SyncResult = { inserted: number; linked: number; deactivated: number };

export async function syncGroupsAction(): Promise<SyncResult> {
  const cfg = getEvolutionConfig(process.env);
  const groups = await evoListGroups(cfg);

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

  revalidatePath("/whatsapp");
  revalidatePath("/base-conhecimento");

  return {
    inserted: plan.insert.length,
    linked: plan.update.length,
    deactivated: plan.deactivate.length,
  };
}
