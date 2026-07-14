import { isPast, validateSchedulable, type PlanPiece, type ScheduleIssue } from "@/lib/sends/plan";

export type LabeledPiece = PlanPiece & { label: string };

export type Partition = {
  /** As que entram na fila. Todas com hora no futuro. */
  schedulable: LabeledPiece[];
  /** Inagendáveis: sem grupo, sem conteúdo, data inválida. */
  blocked: ScheduleIssue[];
  /** Hora já passou. Não entram na fila — e não somem em silêncio. */
  past: LabeledPiece[];
};

/**
 * Separa o que pode ser agendado do que não pode.
 *
 * NADA É AGENDADO PARA TRÁS. Uma peça cuja hora já passou nunca vira linha de fila —
 * nem no replanejamento, nem na aprovação. Ela é reportada, para quem aprova saber que
 * ficou de fora, mas não bloqueia nada: uma campanha real pode ter o toque de "-3 dias"
 * já vencido e o de "hoje à noite" ainda pela frente.
 *
 * Replanejar é tolerante (peça quebrada só fica de fora). Aprovar é rigoroso (peça
 * quebrada barra tudo). Mas peça no passado é sempre excluída, sem exceção.
 */
export function partitionSchedulable(pieces: LabeledPiece[], now: Date = new Date()): Partition {
  const blocked = validateSchedulable(pieces);
  const bad = new Set(blocked.map((i) => i.post_id));

  const usable = pieces.filter((p) => !bad.has(p.post_id));
  const past = usable.filter((p) => isPast(p.send_at, now));
  const pastIds = new Set(past.map((p) => p.post_id));

  return {
    schedulable: usable.filter((p) => !pastIds.has(p.post_id)),
    blocked,
    past,
  };
}
