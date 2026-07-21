import { slugifyIdentifier } from "@/lib/text";

const TIME_RE = /^(\d{2}):(\d{2})$/;

/**
 * Rótulo humano do offset, DERIVADO dos campos que de fato agendam
 * (offset_days + offset_time). Antes era texto livre e divergia do agendamento real.
 */
export function formatOffsetLabel(days: number, time: string): string {
  const dia = days === 0 ? "D0" : days < 0 ? `D${days}` : `D+${days}`;
  const m = time.match(TIME_RE);
  if (!m) return dia;
  const [, hh, mm] = m;
  return mm === "00" ? `${dia} · ${hh}h` : `${dia} · ${hh}h${mm}`;
}

/** Código do slot derivado do papel, para quando a pessoa não escreve um próprio. */
export function codeFromRole(role: string): string {
  return slugifyIdentifier(role);
}

/** Tempo sugerido para um slot novo: herda do último slot da mesma trilha. */
export function nextSlotDefaults(
  last: { offset_days: number; offset_time: string } | undefined,
): { offset_days: number; offset_time: string } {
  if (!last) return { offset_days: 0, offset_time: "10:00" };
  return { offset_days: last.offset_days, offset_time: last.offset_time || "10:00" };
}
