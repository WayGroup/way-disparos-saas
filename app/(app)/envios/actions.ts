"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";

/** O botão de pânico. O worker checa esta flag dentro do claim — nada é entregue com ela ligada. */
export async function setPauseAction(paused: boolean, reason: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("app_settings")
    .update({ sends_paused: paused, paused_reason: reason.trim(), updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw new Error(`Falha ao alterar a pausa: ${error.message}`);
  revalidatePath("/envios");
}

/**
 * Os updates abaixo travam no status esperado (.eq("status", …)) para não correr
 * com o worker: se ele reivindicou a linha no meio do clique, o update não pega.
 */
export async function cancelSendAction(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("scheduled_sends")
    .update({ status: "cancelado" })
    .eq("id", id)
    .eq("status", "pendente");
  if (error) throw new Error(`Falha ao cancelar envio: ${error.message}`);
  revalidatePath("/envios");
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
    .in("status", ["falhou", "cancelado"]);
  if (error) throw new Error(`Falha ao reenviar: ${error.message}`);
  revalidatePath("/envios");
}

/**
 * Linha presa em 'enviando': a função morreu entre chamar a Evolution e gravar o
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
  revalidatePath("/envios");
}
