import type { SendStatus } from "@/lib/db/types";

export type DisplayStatus = SendStatus | "aguardando";

export const DISPLAY_STATUSES: DisplayStatus[] = [
  "aguardando",
  "pendente",
  "enviando",
  "enviado",
  "falhou",
  "expirado",
  "cancelado",
];

/**
 * O worker só entrega envio de campanha aprovada. Um `pendente` de campanha em rascunho
 * não vai sair — e chamá-lo de "pendente" mentiria para quem está olhando a fila
 * esperando a mensagem partir.
 *
 * Não é um estado persistido: é uma leitura de dois campos. Envio avulso não tem
 * campanha e por isso é sempre elegível.
 */
export function displayStatus(send: {
  status: SendStatus;
  campaign_status: string | null;
}): DisplayStatus {
  if (send.status === "pendente" && send.campaign_status === "rascunho") return "aguardando";
  return send.status;
}
