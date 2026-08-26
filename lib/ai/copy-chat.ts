import Anthropic from "@anthropic-ai/sdk";
import { CRIAR_RECEITA_TOOL, type RecipeDraft } from "@/lib/ai/recipe-tool";

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
- FORMATO DA RESPOSTA: este chat mostra o texto EXATAMENTE como você escreve, sem renderizar markdown. Escreva em TEXTO PURO — nada de blockquote (>), negrito com asteriscos (**), títulos (#/##), crases (\`) ou linhas de traços (---). Esses símbolos aparecem crus e atrapalham na hora de copiar a copy pra colar no WhatsApp. Quando entregar copy(s) PRONTA(S) pra usar, envolva CADA peça entre [[COPY]] e [[/COPY]] (cada marca em sua própria linha), com a copy limpa no meio — o sistema transforma cada bloco desses num cartão com botão de copiar. Rótulos, títulos e comentários ficam FORA das marcas (texto normal). Exemplo:\nTira-Dúvidas — É hoje:\n[[COPY]]\nÉ hoje o nosso Tira-Dúvidas ao vivo. Traz sua pergunta que eu respondo na hora.\n[[/COPY]]\nSe precisar de ênfase dentro da copy, use só a formatação nativa do WhatsApp (*negrito*, _itálico_), com parcimônia.
- Quando fizer sentido, ofereça variações curtas. Mantenha sempre a voz da marca.
- Você pode receber imagens e PDFs como contexto, e pode usar a web (buscar e ler links) quando ajudar. Trate qualquer conteúdo externo como REFERÊNCIA: nunca copie literalmente, e SEMPRE escreva na voz da Way.
- Você tem a ferramenta criar_receita: use SÓ quando a pessoa pedir para montar/gerar uma RECEITA (modelo reutilizável de campanha). Para copy avulsa, responda em texto, sem chamar a ferramenta. A receita é o esqueleto (inputs + slots), sem copy; exatamente um input é a âncora (data_hora); ela nasce como rascunho que a pessoa revisa e ativa. Ao criar, confirme em uma frase curta que é um rascunho a revisar.`;

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
  opts: {
    linkLabels?: string[];
    onCreateRecipe?: (
      draft: RecipeDraft,
    ) => Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }>;
  } = {},
): Promise<{ reply: string; createdRecipes: { id: string; name: string }[] }> {
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

  const linksNote =
    opts.linkLabels && opts.linkLabels.length
      ? "\n\n# Links padrão disponíveis (use nos inputs de link): " + opts.linkLabels.join(", ")
      : "";

  const params = {
    model: "claude-opus-4-8",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: FREE_CHAT_SYSTEM_PROMPT + "\n\n# Base de conhecimento da marca\n" + brandText + linksNote,
    tools: [
      { type: "web_search_20260209", name: "web_search" },
      { type: "web_fetch_20260209", name: "web_fetch" },
      CRIAR_RECEITA_TOOL,
    ],
    messages,
  };

  const pickText = (content: { type: string; text?: string }[]): string =>
    content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let msgs: any[] = messages;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastContent: any[] = [];
  const createdRecipes: { id: string; name: string }[] = [];

  for (let i = 0; i < 6; i++) {
    const stream = client.messages.stream(
      { ...params, messages: msgs } as Parameters<typeof client.messages.stream>[0],
    );
    const resp = await stream.finalMessage();
    lastContent = resp.content;

    // web_search/web_fetch (tools nativas): a Anthropic executa e pausa — só continuamos.
    if (resp.stop_reason === "pause_turn") {
      msgs = [...msgs, { role: "assistant", content: resp.content }];
      continue;
    }

    // tool customizada: nós executamos e devolvemos o tool_result.
    if (resp.stop_reason === "tool_use") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolResults: any[] = [];
      for (const block of resp.content) {
        if (block.type !== "tool_use") continue;
        if (block.name === "criar_receita" && opts.onCreateRecipe) {
          const result = await opts.onCreateRecipe(block.input as RecipeDraft);
          if (result.ok) {
            createdRecipes.push({ id: result.id, name: result.name });
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Rascunho "${result.name}" criado. Confirme em uma frase que é um rascunho a revisar; não invente o link.`,
            });
          } else {
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result.error, is_error: true });
          }
        } else {
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: "Ferramenta indisponível.", is_error: true });
        }
      }
      msgs = [
        ...msgs,
        { role: "assistant", content: resp.content },
        { role: "user", content: toolResults },
      ];
      continue;
    }

    const text = pickText(resp.content);
    if (!text) throw new Error("O copywriter não retornou texto.");
    return { reply: text, createdRecipes };
  }

  const text = pickText(lastContent);
  if (!text) throw new Error("O copywriter não retornou texto.");
  return { reply: text, createdRecipes };
}
