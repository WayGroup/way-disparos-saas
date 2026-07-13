export type JitterOptions = {
  minMs?: number;
  maxMs?: number;
  rng?: () => number;
};

export const JITTER_MIN_MS = 20_000;
export const JITTER_MAX_MS = 60_000;

/**
 * O espaçamento anti-ban entre os grupos de uma mesma peça.
 *
 * Ele mora aqui, no relógio — não num sleep dentro do worker. Cinco grupos às 10h
 * viram 10:00:00, 10:00:37, 10:01:15… e o worker só processa o que já venceu.
 * Assim o espaçamento sobrevive a crash, timeout e reexecução do cron, e nenhuma
 * função precisa ficar dormindo (o que estouraria o teto de 60s da Vercel).
 */
export function withJitter(baseIso: string, count: number, opts: JitterOptions = {}): string[] {
  if (count <= 0) return [];

  const base = new Date(baseIso);
  if (Number.isNaN(base.getTime())) return [];

  const minMs = opts.minMs ?? JITTER_MIN_MS;
  const maxMs = opts.maxMs ?? JITTER_MAX_MS;
  const rng = opts.rng ?? Math.random;

  const out: string[] = [];
  let cursor = base.getTime();

  for (let i = 0; i < count; i++) {
    if (i > 0) cursor += Math.round(minMs + rng() * (maxMs - minMs));
    out.push(new Date(cursor).toISOString());
  }

  return out;
}
