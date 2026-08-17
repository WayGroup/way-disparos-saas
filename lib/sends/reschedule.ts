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
/** A chave do índice único do banco: uma linha viva por (peça, grupo). */
function chaveViva(postId: string | null, waGroupId: string): string {
  return `${postId}|${waGroupId}`;
}

/**
 * Tira do plano os pares (peça, grupo) que já têm envio vivo no banco.
 *
 * Existe por causa de `scheduled_sends_post_group_live_idx`, que permite UMA linha por
 * (peça, grupo) contando `pendente`, `enviando` e `enviado`. O replanejamento apaga só os
 * pendentes não-forçados; um "Enviar agora" numa peça cuja hora ainda não chegou deixa
 * linhas `enviado` de pé. Sem este filtro, o replanejamento tentava recriá-las, estourava
 * a constraint e derrubava a ação inteira — na prática, travava QUALQUER edição daquela
 * campanha (mudar copy, trocar grupos, mídia, excluir peça).
 *
 * Regra de produto: quem já recebeu não recebe de novo. O grupo que ainda não recebeu
 * continua sendo enfileirado normalmente.
 *
 * `post_id` nulo é disparo avulso, que está fora do índice único e nunca colide.
 */
export function dropAlreadyLive<T extends { post_id: string | null; wa_group_id: string }>(
  planned: T[],
  live: { post_id: string | null; wa_group_id: string }[],
): T[] {
  const vivos = new Set(
    live.filter((r) => r.post_id !== null).map((r) => chaveViva(r.post_id, r.wa_group_id)),
  );
  return planned.filter(
    (s) => s.post_id === null || !vivos.has(chaveViva(s.post_id, s.wa_group_id)),
  );
}

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
