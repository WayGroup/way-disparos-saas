import { isStale, validateSchedulable, type PlanPiece, type ScheduleIssue } from "@/lib/sends/plan";

export type LabeledPiece = PlanPiece & { label: string };

export type Partition = {
  /** As que entram na fila. */
  schedulable: LabeledPiece[];
  /** Inagendáveis: sem grupo, sem conteúdo, data inválida. */
  blocked: ScheduleIssue[];
  /** Vencidas: a data já passou há mais de 2h. Não entram na fila — e não somem em silêncio. */
  stale: LabeledPiece[];
};

/**
 * Replanejar é tolerante: uma peça inagendável ou vencida simplesmente não vira linha de
 * fila, em vez de derrubar o replanejamento inteiro. É o estado "ainda estou montando".
 *
 * Quem é rigoroso é a aprovação: lá, qualquer peça inagendável bloqueia tudo. Mas peça
 * vencida NUNCA entra na fila, nem na aprovação — só é reportada, para quem aprova saber
 * que ela ficou de fora.
 */
export function partitionSchedulable(pieces: LabeledPiece[], now: Date = new Date()): Partition {
  const blocked = validateSchedulable(pieces);
  const bad = new Set(blocked.map((i) => i.post_id));

  const usable = pieces.filter((p) => !bad.has(p.post_id));
  const stale = usable.filter((p) => isStale(p.send_at, now));
  const staleIds = new Set(stale.map((p) => p.post_id));

  return {
    schedulable: usable.filter((p) => !staleIds.has(p.post_id)),
    blocked,
    stale,
  };
}
