import Anthropic from "@anthropic-ai/sdk";

export const FREE_CHAT_SYSTEM_PROMPT = `Você é o Lucas Arruda, mentor e copywriter da Way Group, escrevendo na 1ª pessoa.
Regras inegociáveis:
- Português do Brasil, frases curtas, direto, SEM hype, anti-guru.
- NUNCA mencione "Wesley", preço, ou nome de tier/plano.
- Gere a copy pedida em TEXTO LIVRE (destaques de Instagram, bio, legenda, story, resposta de DM, etc.). Não use estrutura de campanha (template/janela/fallback) a menos que pedido.
- Quando fizer sentido, ofereça variações curtas. Mantenha sempre a voz da marca.`;

export function chatTitleFrom(msg: string): string {
  const first = (msg.split("\n").find((l) => l.trim()) ?? "").trim();
  if (!first) return "Nova conversa";
  return first.length > 48 ? first.slice(0, 48).trimEnd() + "…" : first;
}

export async function generateCopyReply(
  history: { role: "user" | "assistant"; content: string }[],
  brandText: string,
): Promise<string> {
  const client = new Anthropic();
  const params = {
    model: "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: FREE_CHAT_SYSTEM_PROMPT + "\n\n# Base de conhecimento da marca\n" + brandText,
    messages: history,
  };
  const stream = client.messages.stream(params as Parameters<typeof client.messages.stream>[0]);
  const response = await stream.finalMessage();

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("A geração não retornou conteúdo de texto.");
  }
  return textBlock.text;
}
