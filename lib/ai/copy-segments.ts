// Divide a resposta do copywriter em trechos de comentário (texto normal) e copies
// prontas (blocos entre [[COPY]] e [[/COPY]]). A UI renderiza cada copy num cartão com
// botão de copiar próprio, para o usuário copiar uma peça por vez, limpa.
//
// Módulo puro e SEM dependências de servidor de propósito: o componente cliente do chat
// importa daqui, então nada de puxar o SDK da Anthropic (copy-chat.ts) pro bundle.

export type CopySegment = { type: "text"; text: string } | { type: "copy"; text: string };

const COPY_BLOCK = /\[\[COPY\]\]\s*([\s\S]*?)\s*\[\[\/COPY\]\]/g;

/**
 * Quebra o conteúdo em segmentos na ordem em que aparecem. Texto fora das marcas vira
 * segmento "text"; o miolo de cada par [[COPY]]…[[/COPY]] vira segmento "copy".
 * Sem marcas, devolve um único segmento "text" com todo o conteúdo (retrocompatível).
 */
export function parseCopySegments(content: string): CopySegment[] {
  const segments: CopySegment[] = [];
  let last = 0;
  COPY_BLOCK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COPY_BLOCK.exec(content)) !== null) {
    const before = content.slice(last, m.index).trim();
    if (before) segments.push({ type: "text", text: before });
    const copy = m[1].trim();
    if (copy) segments.push({ type: "copy", text: copy });
    last = COPY_BLOCK.lastIndex;
  }
  const rest = content.slice(last).trim();
  if (rest) segments.push({ type: "text", text: rest });
  return segments;
}
