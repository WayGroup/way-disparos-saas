import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getEvolutionConfig } from "@/lib/evolution/config";
import { evoSend } from "@/lib/evolution/client";
import { buildEvolutionPayload } from "@/lib/sends/payload";
import type { EvolutionConfig } from "@/lib/evolution/types";
import type { ScheduledSend } from "@/lib/db/types";

export type DispatchResult = {
  id: string;
  wa_subject: string;
  ok: boolean;
  wa_message_id?: string;
  error?: string;
};

export const DISPATCH_LIMIT = 10;

/**
 * Envia UMA linha da fila. Pode virar 2 chamadas na Evolution (áudio + texto);
 * o wa_message_id gravado é o da última.
 */
async function sendOne(cfg: EvolutionConfig, send: ScheduledSend): Promise<DispatchResult> {
  const base = { id: send.id, wa_subject: send.wa_subject || send.wa_group_id };
  const calls = buildEvolutionPayload(send.payload, send.wa_group_id);

  if (calls.length === 0) {
    return { ...base, ok: false, error: "Payload vazio: sem texto e sem mídia." };
  }

  try {
    let waMessageId = "";
    for (const call of calls) {
      const result = await evoSend(cfg, call);
      waMessageId = result.waMessageId;
    }
    return { ...base, ok: true, wa_message_id: waMessageId };
  } catch (e) {
    return { ...base, ok: false, error: e instanceof Error ? e.message : "Falha desconhecida." };
  }
}

/**
 * O coração do worker. Reivindica os envios vencidos e entrega um a um.
 *
 * Sequencial de propósito: nada de Promise.all. O espaçamento entre grupos já está
 * no scheduled_at, e disparar em paralelo derrotaria o anti-ban.
 *
 * Chamado pelo cron a cada minuto e, inline, pelo "Enviar agora" — mesma lib,
 * mesmo log, mesmas travas.
 */
export async function dispatchDue(limit: number = DISPATCH_LIMIT): Promise<{
  claimed: number;
  results: DispatchResult[];
}> {
  const supabase = createAdminSupabase();

  const { data, error } = await supabase.rpc("claim_scheduled_sends", { p_limit: limit });
  if (error) throw new Error(`Falha ao reivindicar envios: ${error.message}`);

  const claimed = (data ?? []) as ScheduledSend[];
  if (claimed.length === 0) return { claimed: 0, results: [] };

  // Config quebrada não pode deixar as linhas presas em 'enviando': marca todas
  // como falha (nada foi enviado) e deixa o retry cuidar.
  let cfg: EvolutionConfig;
  try {
    cfg = getEvolutionConfig(process.env);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Evolution não configurada.";
    for (const send of claimed) {
      await supabase.rpc("complete_scheduled_send", {
        p_id: send.id,
        p_ok: false,
        p_wa_message_id: null,
        p_error: message,
      });
    }
    throw new Error(message);
  }

  const results: DispatchResult[] = [];

  for (const send of claimed) {
    const result = await sendOne(cfg, send);
    results.push(result);

    const { error: e } = await supabase.rpc("complete_scheduled_send", {
      p_id: send.id,
      p_ok: result.ok,
      p_wa_message_id: result.wa_message_id ?? null,
      p_error: result.error ?? null,
    });
    // Se a gravação do resultado falhar, a linha fica em 'enviando' e vira decisão
    // humana em /envios. Nunca reenviamos por conta própria: a mensagem já saiu.
    if (e) console.error(`Falha ao finalizar envio ${send.id}: ${e.message}`);
  }

  return { claimed: claimed.length, results };
}
