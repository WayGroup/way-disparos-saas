export function computeSendAt(
  anchor: string,
  offsetDays: number,
  offsetTime: string,
  offsetMinutes = 0,
): string {
  if (!anchor) return "";
  const d = new Date(anchor);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + offsetDays);
  if (offsetTime && /^\d{1,2}:\d{2}$/.test(offsetTime)) {
    // Hora fixa de relógio: manda, e o deslocamento é ignorado.
    const [h, m] = offsetTime.split(":").map(Number);
    // A regex aceita dígitos fora de faixa ("24:00", "9:99"). Isso é entrada quebrada:
    // setHours ROLARIA o dia e produziria um horário plausível — agendando em silêncio
    // no dia errado. Devolvemos vazio para falhar alto na validação, como antes.
    if (h > 23 || m > 59) return "";
    d.setHours(h, m, 0, 0);
  } else if (offsetMinutes) {
    // Relativo: desloca a partir da hora do EVENTO. setMinutes rola dia/mês sozinho.
    d.setMinutes(d.getMinutes() + offsetMinutes);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Offset fixo do Brasil. O horário de verão foi abolido em 2019, então não há
 * DST a considerar. Se um dia voltar, este é o único ponto do código a mudar.
 */
export const BR_OFFSET = "-03:00";

const SEND_AT_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

/**
 * Converte o send_at do app ("YYYY-MM-DD HH:mm", sem fuso) no instante real (ISO UTC).
 * É a fronteira entre a agenda editorial, que é local, e a fila, que é absoluta.
 */
export function toInstant(sendAt: string, offset: string = BR_OFFSET): string | null {
  const m = sendAt.match(SEND_AT_RE);
  if (!m) return null;

  const [, y, mo, d, hh, mm] = m.map(Number) as unknown as number[];
  if (Number(hh) > 23 || Number(mm) > 59) return null;

  // O Date do JS não rejeita 31/02 — ele rola para 03/03. Sem esta checagem,
  // uma data errada viraria silenciosamente outra data.
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return null;
  }

  const date = new Date(`${sendAt.replace(" ", "T")}:00${offset}`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function formatSendAt(value: string): string {
  if (!value) return "";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!m) return value;
  const [, y, mo, d, hh, mm] = m;
  const dow = new Date(Number(y), Number(mo) - 1, Number(d)).getDay();
  return `${DIAS[dow]} ${d}/${mo} · ${hh}:${mm}`;
}

/**
 * O formato da agenda editorial ("2026-08-18 19:07") e o do seletor nativo
 * ("2026-08-18T19:07") são a mesma informação com separador diferente. Uma regex serve às
 * duas direções: aceita espaço ou T, e tolera os segundos que alguns navegadores mandam.
 */
const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?$/;

/** "2026-08-18 19:07" → "2026-08-18T19:07", que é o que `<input type="datetime-local">` lê. */
export function toDatetimeLocal(sendAt: string): string {
  const m = sendAt.match(DATETIME_RE);
  return m ? `${m[1]}T${m[2]}` : "";
}

/**
 * "2026-08-18T19:07" → "2026-08-18 19:07", o formato guardado.
 *
 * Valor que não casa devolve "" em vez da string original: um send_at malformado no banco
 * só apareceria na validação da aprovação, longe da causa. Vazio é resposta honesta —
 * peça sem data existe, apenas fica fora da fila.
 */
export function fromDatetimeLocal(value: string): string {
  const m = value.match(DATETIME_RE);
  return m ? `${m[1]} ${m[2]}` : "";
}

/**
 * Decide o aviso a mostrar no formulário de edição de uma peça sobre a data de envio.
 * Devolve "" quando não há nada a avisar; nos outros três casos, a frase explica o
 * problema. Nunca bloqueia o Salvar — quem reorganiza uma campanha passa por estados
 * intermediários, então isto só informa.
 *
 * O caso "data inválida" existe porque `fromDatetimeLocal` só confere o formato
 * ("\d{4}-\d{2}-\d{2} \d{2}:\d{2}"), não se a data é real. Um ano digitado como "0026" em
 * vez de "2026" casa a regex e é gravado — mas `toInstant` rejeita (o `Date.UTC` do JS
 * trata ano de 2 dígitos como 19XX, então a checagem de "a data existe" falha). Sem este
 * terceiro ramo, esse valor não disparava aviso nenhum: `isPast` devolve `false` porque não
 * tem instante para comparar, e a peça era salva com uma data que o replanejamento não
 * consegue agendar — cancelando os envios pendentes dela em silêncio.
 *
 * Não importa `isPast` de `lib/sends/plan.ts` de propósito: esse módulo importa
 * `toInstant` daqui, e fechar o ciclo (`schedule.ts` → `plan.ts` → `schedule.ts`) não vale
 * a pena para reaproveitar uma comparação de uma linha.
 */
export function avisoDeData(sendAt: string, now: Date): string {
  if (!sendAt) {
    return "Sem data: a peça não entra na fila até você marcar um horário. Os envios já agendados dela são cancelados.";
  }

  const iso = toInstant(sendAt);
  if (!iso) {
    return "Data inválida — confira o ano. A peça não entra na fila, e os envios já agendados dela são cancelados.";
  }

  if (new Date(iso).getTime() <= now.getTime()) {
    return "Essa data já passou. A peça não entra na fila — nada é agendado para trás. Os envios já agendados dela são cancelados.";
  }

  return "";
}
