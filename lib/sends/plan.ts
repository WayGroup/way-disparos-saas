import { toInstant } from "@/lib/schedule";
import { withJitter, type JitterOptions } from "@/lib/sends/jitter";
import { buildEvolutionPayload, isGroupJid, type SendPayload } from "@/lib/sends/payload";

export type PlanTarget = {
  community_id: string;
  wa_group_id: string;
  wa_subject: string;
};

export type PlanPiece = {
  post_id: string | null;
  /** "YYYY-MM-DD HH:mm" no fuso de São Paulo. Vazio = agora. */
  send_at: string;
  payload: SendPayload;
  targets: PlanTarget[];
};

export type PlannedSend = {
  post_id: string | null;
  community_id: string;
  wa_group_id: string;
  wa_subject: string;
  scheduled_at: string;
  payload: SendPayload;
};

export type PlanOptions = JitterOptions & { now?: Date };

/**
 * Um envio só sai se estiver atrasado no máximo 2 horas.
 *
 * Sem essa janela, aprovar uma campanha cuja data já passou solta a fila inteira de uma
 * vez: o claim entrega tudo que tem `scheduled_at <= now()`, e o jitter — que mora no
 * scheduled_at — também está todo no passado. Resultado: rajada, conteúdo desatualizado,
 * e o número no caminho do ban.
 *
 * Duas horas cobre o atraso legítimo (deploy, worker fora do ar, cron engasgado) sem
 * cobrir "essa mensagem era de ontem".
 */
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

/** `send_at` vazio significa "agora" e nunca é velho. Data inválida é problema do validate. */
export function isStale(sendAt: string, now: Date): boolean {
  if (!sendAt) return false;
  const iso = toInstant(sendAt);
  if (!iso) return false;
  return now.getTime() - new Date(iso).getTime() > STALE_AFTER_MS;
}

/**
 * Materializa as peças em linhas de fila: uma por (peça × grupo).
 *
 * O jitter reinicia a cada peça — o primeiro grupo de cada uma cai exatamente no
 * send_at pedido, e só os seguintes são espaçados. Peça sem grupo produz zero linhas
 * (validateSchedulable é quem reclama disso antes de chegar aqui).
 */
export function planSends(pieces: PlanPiece[], opts: PlanOptions = {}): PlannedSend[] {
  const now = opts.now ?? new Date();
  const out: PlannedSend[] = [];

  for (const piece of pieces) {
    if (piece.targets.length === 0) continue;

    const baseIso = piece.send_at ? toInstant(piece.send_at) : now.toISOString();
    if (!baseIso) continue;

    const instants = withJitter(baseIso, piece.targets.length, opts);

    piece.targets.forEach((target, i) => {
      out.push({
        post_id: piece.post_id,
        community_id: target.community_id,
        wa_group_id: target.wa_group_id,
        wa_subject: target.wa_subject,
        scheduled_at: instants[i],
        payload: piece.payload,
      });
    });
  }

  return out;
}

export type ScheduleIssue = {
  post_id: string | null;
  label: string;
  message: string;
};

export type ValidateOptions = {
  /**
   * `send_at` vazio significa "agora". Numa campanha isso é erro (toda peça tem hora
   * marcada); no "Enviar agora" e no disparo rápido é justamente o pedido.
   */
  allowImmediate?: boolean;
};

/**
 * O portão antes de gravar qualquer coisa na fila. Se alguma peça tem problema,
 * "Aprovar e agendar" falha inteiro — nada de agendar meia campanha.
 */
export function validateSchedulable(
  pieces: (PlanPiece & { label: string })[],
  opts: ValidateOptions = {},
): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];

  for (const piece of pieces) {
    const issue = (message: string) =>
      issues.push({ post_id: piece.post_id, label: piece.label, message });

    if (!piece.send_at) {
      if (!opts.allowImmediate) issue("Sem data e hora de envio.");
    } else if (!toInstant(piece.send_at)) {
      issue(`Data de envio inválida: "${piece.send_at}".`);
    }

    if (piece.targets.length === 0) {
      issue("Nenhum grupo selecionado.");
    } else if (piece.targets.some((t) => !t.wa_group_id)) {
      issue("Grupo selecionado não está vinculado a um grupo do WhatsApp.");
    } else if (piece.targets.some((t) => !isGroupJid(t.wa_group_id))) {
      // Só grupo. Um destino que não seja @g.us não passa daqui.
      issue("Destino inválido: não é um grupo do WhatsApp.");
    }

    if (buildEvolutionPayload(piece.payload, "x@g.us").length === 0) {
      issue("Peça sem texto e sem mídia — não há o que enviar.");
    }
  }

  return issues;
}
