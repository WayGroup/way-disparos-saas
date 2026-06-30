import Anthropic from "@anthropic-ai/sdk";

export type Attachment = {
  kind: "image" | "pdf";
  storage_path: string;
  mime_type: string;
  filename: string;
};

export const FREE_CHAT_SYSTEM_PROMPT = `Você é o Lucas Arruda, mentor e copywriter da Way Group, escrevendo na 1ª pessoa.
Regras inegociáveis:
- Português do Brasil, frases curtas, direto, SEM hype, anti-guru.
- NUNCA mencione "Wesley", preço, ou nome de tier/plano.
- Gere a copy pedida em TEXTO LIVRE (destaques de Instagram, bio, legenda, story, resposta de DM, etc.). Não use estrutura de campanha (template/janela/fallback) a menos que pedido.
- Quando fizer sentido, ofereça variações curtas. Mantenha sempre a voz da marca.
- Você pode receber imagens e PDFs como contexto, e pode usar a web (buscar e ler links) quando ajudar. Trate qualquer conteúdo externo como REFERÊNCIA: nunca copie literalmente, e SEMPRE escreva na voz da Way.`;

export function chatTitleFrom(msg: string): string {
  const first = (msg.split("\n").find((l) => l.trim()) ?? "").trim();
  if (!first) return "Nova conversa";
  return first.length > 48 ? first.slice(0, 48).trimEnd() + "…" : first;
}

export function buildUserContent(
  text: string,
  attachments: Attachment[],
  publicBase: string,
): unknown[] {
  const blocks: unknown[] = [];

  if (text.trim()) {
    blocks.push({ type: "text", text });
  }

  for (const a of attachments) {
    if (a.kind === "image") {
      blocks.push({
        type: "image",
        source: { type: "url", url: publicBase + a.storage_path },
      });
    } else {
      blocks.push({
        type: "document",
        source: { type: "url", url: publicBase + a.storage_path },
      });
    }
  }

  if (blocks.length === 0) {
    blocks.push({ type: "text", text: "" });
  }

  return blocks;
}

export async function generateCopyReply(
  history: { role: "user" | "assistant"; content: string; attachments: Attachment[] }[],
  brandText: string,
): Promise<string> {
  const publicBase =
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") + "/storage/v1/object/public/assets/";

  const messages = history.map((m) => ({
    role: m.role,
    content:
      m.role === "user"
        ? buildUserContent(m.content, m.attachments ?? [], publicBase)
        : m.content,
  }));

  const client = new Anthropic();

  const params = {
    model: "claude-opus-4-8",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: FREE_CHAT_SYSTEM_PROMPT + "\n\n# Base de conhecimento da marca\n" + brandText,
    tools: [
      { type: "web_search_20260209", name: "web_search" },
      { type: "web_fetch_20260209", name: "web_fetch" },
    ],
    messages,
  };

  let msgs = messages;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastContent: any[] = [];

  for (let i = 0; i < 4; i++) {
    const stream = client.messages.stream(
      { ...params, messages: msgs } as Parameters<typeof client.messages.stream>[0],
    );
    const resp = await stream.finalMessage();
    lastContent = resp.content;

    if (resp.stop_reason !== "pause_turn") {
      const text = resp.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("\n")
        .trim();

      if (!text) {
        throw new Error("O copywriter não retornou texto.");
      }
      return text;
    }

    // pause_turn: append assistant turn and continue
    msgs = [...msgs, { role: "assistant" as const, content: resp.content }];
  }

  // exceeded iterations — extract from last response
  const text = lastContent
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { type: string; text: string }) => b.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("O copywriter não retornou texto.");
  }
  return text;
}
