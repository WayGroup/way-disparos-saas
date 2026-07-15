import type { SendStatus } from "@/lib/db/types";
import { displayStatus } from "@/lib/sends/status";

/** Preso em `enviando` há mais de 10 min: a função morreu no meio, precisa de decisão. */
export const STUCK_MS = 10 * 60 * 1000;

export type QueueSend = {
  status: SendStatus;
  campaign_status: string | null;
  claimed_at: string | null;
  scheduled_at: string;
};

export function isStuck(
  send: { status: SendStatus; claimed_at: string | null },
  now: Date,
): boolean {
  return (
    send.status === "enviando" &&
    !!send.claimed_at &&
    now.getTime() - new Date(send.claimed_at).getTime() > STUCK_MS
  );
}

/**
 * Divide a Fila em dois blocos com pesos diferentes:
 *
 * - `attention`: falhas, expirados e envios presos. São passado, mas pedem uma decisão
 *   sua (reenviar ou dispensar). Ficam no topo, fora da cronologia passiva.
 * - `upcoming`: o que ainda vai sair — aguardando, a sair, em andamento. É isto que a
 *   linha do tempo desenha, com a divisória do AGORA.
 *
 * O que já terminou (enviado, cancelado) não é Fila: é Histórico, e nem chega aqui.
 */
export function partitionQueue<T extends QueueSend>(
  sends: T[],
  now: Date,
): { attention: T[]; upcoming: T[] } {
  const attention: T[] = [];
  const upcoming: T[] = [];

  for (const send of sends) {
    const st = displayStatus(send);
    if (st === "falhou" || st === "expirado" || isStuck(send, now)) {
      attention.push(send);
    } else {
      upcoming.push(send);
    }
  }

  // Atenção: problema mais recente primeiro. Próximos: a linha do tempo reordena.
  attention.sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

  return { attention, upcoming };
}
