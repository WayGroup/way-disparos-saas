const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const TZ = "America/Sao_Paulo";

/** Partes de um instante já no fuso de São Paulo — o fuso em que o time pensa. */
function parts(iso: string): { y: number; m: number; d: number; hh: string; mm: string; dow: number } {
  const date = new Date(iso);
  const f = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);

  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  // weekday vem como "seg.", "ter."… — normalizamos pelo índice do dia calculado à parte.
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  return { y, m, d, hh: get("hour"), mm: get("minute"), dow };
}

export function dayKey(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function timeLabel(iso: string): string {
  const { hh, mm } = parts(iso);
  return `${hh}:${mm}`;
}

/** "hoje", "amanhã", "ontem" ou "qua · 22 jul" — datas próximas ganham nome, não número. */
export function dayLabel(iso: string, now: Date): string {
  const key = dayKey(iso);
  const nowKey = dayKey(now.toISOString());

  const shift = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return dayKey(d.toISOString());
  };

  if (key === nowKey) return "hoje";
  if (key === shift(1)) return "amanhã";
  if (key === shift(-1)) return "ontem";

  const { d, m, dow } = parts(iso);
  return `${DIAS[dow]} · ${d} ${MESES[m - 1]}`;
}

export type TimelineDay<T> = { key: string; label: string; sends: T[] };

export type Timeline<T> = {
  days: TimelineDay<T>[];
  /** Instante do primeiro envio que ainda não venceu. Null se não há nada pela frente. */
  nextAt: string | null;
  /** Id do primeiro envio futuro — é antes dele que a divisória do AGORA é desenhada. */
  firstFutureId: string | null;
};

/**
 * Organiza a fila como uma linha do tempo, em ordem cronológica, agrupada por dia.
 *
 * O ponto não é ordenar: é deixar visível onde está o AGORA. Tudo acima da divisória
 * já saiu e não tem volta; tudo abaixo ainda dá para cancelar. É a única distinção que
 * importa quando a mensagem vai para grupos de cliente de verdade.
 */
export function buildTimeline<T extends { id: string; scheduled_at: string }>(
  sends: T[],
  now: Date,
): Timeline<T> {
  const sorted = [...sends].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const nowMs = now.getTime();

  const future = sorted.find((s) => new Date(s.scheduled_at).getTime() > nowMs) ?? null;

  const days: TimelineDay<T>[] = [];
  for (const send of sorted) {
    const key = dayKey(send.scheduled_at);
    const last = days[days.length - 1];
    if (last && last.key === key) last.sends.push(send);
    else days.push({ key, label: dayLabel(send.scheduled_at, now), sends: [send] });
  }

  return {
    days,
    nextAt: future?.scheduled_at ?? null,
    firstFutureId: future?.id ?? null,
  };
}

/** "em 12 min", "em 2 h", "em 3 dias" — o quanto falta para a próxima mensagem sair. */
export function countdown(iso: string, now: Date): string {
  const diff = new Date(iso).getTime() - now.getTime();
  if (diff <= 0) return "agora";

  const min = Math.round(diff / 60_000);
  if (min < 60) return `em ${min} min`;

  const h = Math.round(min / 60);
  if (h < 48) return `em ${h} h`;

  return `em ${Math.round(h / 24)} dias`;
}
