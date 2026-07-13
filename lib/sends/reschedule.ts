import { validateSchedulable, type PlanPiece, type ScheduleIssue } from "@/lib/sends/plan";

export type LabeledPiece = PlanPiece & { label: string };

/**
 * Replanejar é tolerante: uma peça inagendável simplesmente não vira linha de fila,
 * em vez de derrubar o replanejamento inteiro. É o estado "ainda estou montando".
 *
 * Quem é rigoroso é a aprovação: lá, qualquer peça inagendável bloqueia tudo.
 */
export function partitionSchedulable(pieces: LabeledPiece[]): {
  schedulable: LabeledPiece[];
  blocked: ScheduleIssue[];
} {
  const blocked = validateSchedulable(pieces);
  const bad = new Set(blocked.map((i) => i.post_id));
  return { schedulable: pieces.filter((p) => !bad.has(p.post_id)), blocked };
}
