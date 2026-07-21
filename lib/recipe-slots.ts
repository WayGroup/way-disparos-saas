import { slugifyIdentifier } from "@/lib/text";

// Mesma tolerância do agendador (lib/schedule.ts aceita 1 ou 2 dígitos na hora):
// uma hora legada "9:00" agenda às 09:00, então ela precisa ser reconhecida aqui
// também — senão o rótulo diria "sem hora" enquanto o worker dispara às 09:00.
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

/** Hora normalizada em HH:mm ("" quando inválida). O <input type="time"> exige o zero à esquerda. */
export function padTime(time: string): string {
  const m = time.match(TIME_RE);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** Lê o deslocamento em português: "na hora", "13min depois", "1h antes", "1h30 antes". */
function relativeReading(total: number): string {
  if (total === 0) return "na hora";
  const abs = Math.abs(total);
  const dir = total < 0 ? "antes" : "depois";
  const h = Math.floor(abs / 60);
  const mm = abs % 60;
  if (h === 0) return `${mm}min ${dir}`;
  if (mm === 0) return `${h}h ${dir}`;
  return `${h}h${String(mm).padStart(2, "0")} ${dir}`;
}

/**
 * Rótulo humano do offset, DERIVADO dos campos que de fato agendam.
 * Com hora fixa lê o relógio; sem ela, lê o deslocamento a partir da hora do evento.
 */
export function formatOffsetLabel(days: number, time: string, offsetMinutes = 0): string {
  const dia = days === 0 ? "D0" : days < 0 ? `D${days}` : `D+${days}`;
  const m = time.match(TIME_RE);
  if (m) {
    const hh = m[1].padStart(2, "0");
    const mm = m[2];
    return mm === "00" ? `${dia} · ${hh}h` : `${dia} · ${hh}h${mm}`;
  }
  return `${dia} · ${relativeReading(offsetMinutes)}`;
}

/** Código do slot derivado do papel, para quando a pessoa não escreve um próprio. */
export function codeFromRole(role: string): string {
  return slugifyIdentifier(role);
}

/**
 * "Quando" sugerido para um slot novo: herda o do último slot da mesma trilha —
 * inclusive o MODO (hora fixa vs relativo). O primeiro slot da trilha nasce às 10:00 fixas.
 */
export function nextSlotDefaults(
  last: { offset_days: number; offset_time: string; offset_minutes: number } | undefined,
): { offset_days: number; offset_time: string; offset_minutes: number } {
  if (!last) return { offset_days: 0, offset_time: "10:00", offset_minutes: 0 };
  return {
    offset_days: last.offset_days,
    offset_time: last.offset_time,
    offset_minutes: last.offset_minutes,
  };
}

/**
 * O rótulo guardado é só a parte do dia do derivado (ex.: "D0" para "D0 · na hora")?
 * Antes da hora relativa, hora vazia gerava apenas a parte do dia — esses rótulos foram
 * escritos pelo próprio sistema, não à mão, e não devem disparar o aviso de perda.
 */
export function isLegacyAutoLabel(stored: string, derived: string): boolean {
  return stored !== "" && stored === derived.split(" · ")[0];
}

/** Quebra o deslocamento em sinal + horas + minutos, para os campos da UI. */
export function splitOffsetMinutes(
  total: number,
): { sign: "antes" | "depois"; hours: number; minutes: number } {
  const abs = Math.abs(total);
  return { sign: total > 0 ? "depois" : "antes", hours: Math.floor(abs / 60), minutes: abs % 60 };
}

/** Junta sinal + horas + minutos no deslocamento em minutos (negativo = antes). */
export function joinOffsetMinutes(
  sign: "antes" | "depois",
  hours: number,
  minutes: number,
): number {
  const abs = Math.abs(hours) * 60 + Math.abs(minutes);
  const result = sign === "antes" ? -abs : abs;
  return result === -0 ? 0 : result;
}
