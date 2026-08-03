# Copywriter gera receita pela conversa (tool) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O chat do copywriter ganha uma ferramenta `criar_receita` que o modelo chama na conversa para gerar um rascunho de receita (esqueleto), que a pessoa revisa e ativa no editor manual.

**Architecture:** Helpers puros em `lib/ai/recipe-tool.ts` (a tool Anthropic + validação + mapeamento + selo). `generateCopyReply` passa a tratar `stop_reason === "tool_use"`, executando a tool via um **executor injetado** pela action (para o `lib/ai` não tocar no banco). A action `sendCopyMessageAction` cria o rascunho (`active=false`) via `save_recipe` e sela a resposta com um link ao editor.

**Tech Stack:** Next.js (App Router, server actions) + TypeScript + Vitest + Supabase (RPC) + `@anthropic-ai/sdk` (tool use). PT-BR.

## Global Constraints

- **Sem migration.** `recipes`/`recipe_inputs`/`recipe_slots`, a coluna `active` e o RPC `save_recipe` já existem.
- **Rascunho sempre:** a receita nasce `active = false`; a pessoa revisa e ativa no editor.
- **Só criar** receita nova (não editar existente); receita é esqueleto **sem copy**.
- **Sem tocar** em campanhas, envio, fila, nem no chat de refino.
- **`lib/ai` não importa do `app/`** — os helpers devolvem objetos planos.
- **Selo com link é derivado no servidor**, nunca confiado ao texto do modelo.
- **Voz do prompt:** Lucas Arruda, PT-BR, sem hype; nunca "Wesley", preço ou tier.
- **Node vem do nvm:** se `node`/`npx` não existirem, rode antes `export NVM_DIR="$HOME/.nvm"; \. "$NVM_DIR/nvm.sh"`.

---

### Task 1: Tool + helpers puros — `lib/ai/recipe-tool.ts`

**Files:**
- Create: `lib/ai/recipe-tool.ts`
- Test: `lib/ai/recipe-tool.test.ts`

**Interfaces:**
- Produces:
  - `type RecipeDraft` (e `RecipeDraftInput`, `RecipeDraftSlot`)
  - `CRIAR_RECEITA_TOOL` (objeto da tool Anthropic)
  - `validateRecipeDraft(draft: RecipeDraft): { ok: true } | { ok: false; error: string }`
  - `toSaveRecipePayload(draft: RecipeDraft): { inputs: {...}[]; slots: {...}[] }`
  - `formatRecipeSeal(recipes: { id: string; name: string }[]): string`

- [ ] **Step 1: Escrever os testes que falham**

Criar `lib/ai/recipe-tool.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateRecipeDraft, toSaveRecipePayload, formatRecipeSeal, type RecipeDraft } from "@/lib/ai/recipe-tool";

function draft(over: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: "Webinário",
    description: "d",
    inputs: [
      { label: "Nome interno", field_type: "texto", required: true, is_anchor: false },
      { label: "Data e hora do evento", field_type: "data_hora", required: true, is_anchor: true },
    ],
    slots: [
      { track: "grupos", role: "Convite", offset_days: -1, offset_time: "", offset_minutes: -60, meta_category: null, suggested_media: "Vídeo", code: "" },
    ],
    ...over,
  };
}

describe("validateRecipeDraft", () => {
  it("draft válido passa", () => expect(validateRecipeDraft(draft())).toEqual({ ok: true }));
  it("sem input reclama", () =>
    expect(validateRecipeDraft(draft({ inputs: [] })).ok).toBe(false));
  it("sem âncora reclama", () =>
    expect(validateRecipeDraft(draft({ inputs: [{ label: "x", field_type: "texto", required: true, is_anchor: false }] })).ok).toBe(false));
  it("duas âncoras reclama", () =>
    expect(validateRecipeDraft(draft({ inputs: [
      { label: "a", field_type: "data_hora", required: true, is_anchor: true },
      { label: "b", field_type: "data_hora", required: true, is_anchor: true },
    ] })).ok).toBe(false));
  it("âncora que não é data_hora reclama", () =>
    expect(validateRecipeDraft(draft({ inputs: [{ label: "a", field_type: "texto", required: true, is_anchor: true }] })).ok).toBe(false));
  it("sem slot reclama", () =>
    expect(validateRecipeDraft(draft({ slots: [] })).ok).toBe(false));
  it("slot api sem categoria reclama", () =>
    expect(validateRecipeDraft(draft({ slots: [
      { track: "api", role: "Toque", offset_days: 0, offset_time: "10:00", offset_minutes: 0, meta_category: null, suggested_media: "", code: "" },
    ] })).ok).toBe(false));
});

describe("toSaveRecipePayload", () => {
  it("mapeia inputs e slots com defaults", () => {
    const p = toSaveRecipePayload(draft());
    expect(p.inputs).toEqual([
      { label: "Nome interno", field_type: "texto", required: true, is_anchor: false },
      { label: "Data e hora do evento", field_type: "data_hora", required: true, is_anchor: true },
    ]);
    expect(p.slots[0]).toEqual({
      track: "grupos", code: "", role: "Convite", meta_category: null, target_communities: null,
      suggested_media: "Vídeo", offset_days: -1, offset_time: "", offset_minutes: -60, offset_label: "",
    });
  });
  it("zera meta_category de slot grupos mesmo se vier preenchido", () => {
    const p = toSaveRecipePayload(draft({ slots: [
      { track: "grupos", role: "x", offset_days: 0, offset_time: "", offset_minutes: 0, meta_category: "UTILITY", suggested_media: "", code: "" },
    ] }));
    expect(p.slots[0].meta_category).toBeNull();
  });
});

describe("formatRecipeSeal", () => {
  it("vazio quando nada criado", () => expect(formatRecipeSeal([])).toBe(""));
  it("traz nome e caminho do editor", () => {
    const s = formatRecipeSeal([{ id: "abc", name: "Webinário" }]);
    expect(s).toContain("Webinário");
    expect(s).toContain("/receitas/abc");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/ai/recipe-tool.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ai/recipe-tool'`.

- [ ] **Step 3: Implementar**

Criar `lib/ai/recipe-tool.ts`:

```ts
export type RecipeDraftInput = {
  label: string;
  field_type: "texto" | "data_hora" | "url" | "link" | "links_multi";
  required: boolean;
  is_anchor: boolean;
};

export type RecipeDraftSlot = {
  track: "api" | "grupos";
  role: string;
  offset_days: number;
  offset_time: string;
  offset_minutes: number;
  meta_category: "UTILITY" | "MARKETING" | null;
  suggested_media: string;
  code: string;
};

export type RecipeDraft = {
  name: string;
  description: string;
  inputs: RecipeDraftInput[];
  slots: RecipeDraftSlot[];
};

/** Ferramenta que o copywriter chama para gerar um rascunho de receita. */
export const CRIAR_RECEITA_TOOL = {
  name: "criar_receita",
  description:
    "Cria um RASCUNHO de receita (modelo reutilizável de campanha) a partir do que foi conversado. " +
    "Use SOMENTE quando a pessoa pedir para montar/gerar uma receita. Receita é o ESQUELETO (inputs + slots), " +
    "sem copy. Exatamente um input é a âncora (field_type data_hora, a data do evento). Os offsets dos slots " +
    "seguem o modelo relativo: offset_days + hora fixa em offset_time (HH:mm), OU offset_time vazio e um " +
    "offset_minutes a partir da hora do evento (negativo = antes). A receita nasce como rascunho a revisar.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["name", "description", "inputs", "slots"],
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      inputs: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "field_type", "required", "is_anchor"],
          properties: {
            label: { type: "string" },
            field_type: { type: "string", enum: ["texto", "data_hora", "url", "link", "links_multi"] },
            required: { type: "boolean" },
            is_anchor: { type: "boolean" },
          },
        },
      },
      slots: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["track", "role", "offset_days", "offset_time", "offset_minutes", "meta_category", "suggested_media", "code"],
          properties: {
            track: { type: "string", enum: ["api", "grupos"] },
            role: { type: "string" },
            offset_days: { type: "integer" },
            offset_time: { type: "string" },
            offset_minutes: { type: "integer" },
            meta_category: { type: ["string", "null"], enum: ["UTILITY", "MARKETING", null] },
            suggested_media: { type: "string" },
            code: { type: "string" },
          },
        },
      },
    },
  },
} as const;

/** Regras semânticas que o input_schema não cobre. A mensagem é para o modelo corrigir. */
export function validateRecipeDraft(
  draft: RecipeDraft,
): { ok: true } | { ok: false; error: string } {
  if (draft.inputs.length === 0) {
    return { ok: false, error: "A receita precisa de ao menos um input — no mínimo a data do evento, que é a âncora." };
  }
  const anchors = draft.inputs.filter((i) => i.is_anchor);
  if (anchors.length !== 1) {
    return { ok: false, error: `A receita precisa de EXATAMENTE uma âncora (is_anchor: true); recebi ${anchors.length}. A âncora é a data do evento.` };
  }
  if (anchors[0].field_type !== "data_hora") {
    return { ok: false, error: "A âncora precisa ser do tipo data_hora (a data e hora do evento)." };
  }
  if (draft.slots.length === 0) {
    return { ok: false, error: "A receita precisa de ao menos um slot (uma peça de campanha)." };
  }
  if (draft.slots.some((s) => s.track === "api" && !s.meta_category)) {
    return { ok: false, error: "Todo slot da trilha api precisa de meta_category (UTILITY ou MARKETING)." };
  }
  return { ok: true };
}

/** Mapeia o draft para o payload do save_recipe (objetos planos, com defaults). */
export function toSaveRecipePayload(draft: RecipeDraft): {
  inputs: { label: string; field_type: string; required: boolean; is_anchor: boolean }[];
  slots: {
    track: "api" | "grupos"; code: string; role: string;
    meta_category: "UTILITY" | "MARKETING" | null; target_communities: null;
    suggested_media: string; offset_days: number; offset_time: string;
    offset_minutes: number; offset_label: string;
  }[];
} {
  return {
    inputs: draft.inputs.map((i) => ({
      label: i.label, field_type: i.field_type, required: i.required, is_anchor: i.is_anchor,
    })),
    slots: draft.slots.map((s) => ({
      track: s.track,
      code: s.code ?? "",
      role: s.role,
      // meta_category só existe na trilha api; grupos sempre null.
      meta_category: s.track === "api" ? s.meta_category : null,
      target_communities: null,
      suggested_media: s.suggested_media ?? "",
      offset_days: s.offset_days,
      offset_time: s.offset_time ?? "",
      offset_minutes: s.offset_minutes ?? 0,
      offset_label: "",
    })),
  };
}

/** Selo factual da(s) receita(s) criada(s), com o caminho do editor. "" se nada foi criado. */
export function formatRecipeSeal(recipes: { id: string; name: string }[]): string {
  if (recipes.length === 0) return "";
  return recipes
    .map((r) => `✓ Rascunho de receita criado: "${r.name}". Abra em /receitas/${r.id} para revisar e ativar.`)
    .join("\n");
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/ai/recipe-tool.test.ts`
Expected: PASS.

- [ ] **Step 5: Suíte + typecheck**

Run: `npx vitest run` → PASS
Run: `npx tsc --noEmit` → sem erros

- [ ] **Step 6: Commit**

```bash
git add lib/ai/recipe-tool.ts lib/ai/recipe-tool.test.ts
git commit -m "feat: tool criar_receita + validacao, mapeamento e selo (puros)"
```

---

### Task 2: Laço tool-use no copywriter — `lib/ai/copy-chat.ts`

**Files:**
- Modify: `lib/ai/copy-chat.ts`

**Interfaces:**
- Consumes: `CRIAR_RECEITA_TOOL`, `type RecipeDraft` (Task 1).
- Produces: `generateCopyReply(history, brandText, opts?): Promise<{ reply: string; createdRecipes: { id: string; name: string }[] }>` com `opts: { linkLabels?: string[]; onCreateRecipe?: (draft: RecipeDraft) => Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> }`.

> **Nota:** esta task muda o retorno de `generateCopyReply` de `string` para objeto, então `sendCopyMessageAction` (única chamadora) para de compilar — o `tsc` fica vermelho **até a Task 3**. Use `npx vitest run` como gate aqui (nenhum teste cobre `generateCopyReply`).

- [ ] **Step 1: Importar a tool e ampliar o prompt**

Em `lib/ai/copy-chat.ts`, adicionar no topo:

```ts
import { CRIAR_RECEITA_TOOL, type RecipeDraft } from "@/lib/ai/recipe-tool";
```

E acrescentar ao final da string `FREE_CHAT_SYSTEM_PROMPT` (dentro das crases, como novo bullet):

```
- Você tem a ferramenta criar_receita: use SÓ quando a pessoa pedir para montar/gerar uma RECEITA (modelo reutilizável de campanha). Para copy avulsa, responda em texto, sem chamar a ferramenta. A receita é o esqueleto (inputs + slots), sem copy; exatamente um input é a âncora (data_hora); ela nasce como rascunho que a pessoa revisa e ativa. Ao criar, confirme em uma frase curta que é um rascunho a revisar.
```

- [ ] **Step 2: Reescrever `generateCopyReply` com a nova assinatura e o laço tool-use**

Substituir a função `generateCopyReply` inteira por:

```ts
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
```

- [ ] **Step 3: Suíte (o typecheck fica vermelho até a Task 3)**

Run: `npx vitest run`
Expected: PASS — `copy-chat.test.ts` cobre `chatTitleFrom`/`buildUserContent`/`FREE_CHAT_SYSTEM_PROMPT` (o bullet novo não remove os guardrails checados); nada testa `generateCopyReply`.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/copy-chat.ts
git commit -m "feat: copywriter trata tool_use e expoe criar_receita (laco + prompt)"
```

---

### Task 3: Executor + persistência — `app/(app)/copywriter/actions.ts`

**Files:**
- Modify: `app/(app)/copywriter/actions.ts`

**Interfaces:**
- Consumes: `generateCopyReply(history, brandText, { linkLabels, onCreateRecipe })` (Task 2); `validateRecipeDraft`, `toSaveRecipePayload`, `formatRecipeSeal`, `type RecipeDraft` (Task 1); `listLinks` (`lib/db/links.ts`).

- [ ] **Step 1: Imports**

Em `app/(app)/copywriter/actions.ts`, adicionar aos imports do topo:

```ts
import { listLinks } from "@/lib/db/links";
import { validateRecipeDraft, toSaveRecipePayload, formatRecipeSeal, type RecipeDraft } from "@/lib/ai/recipe-tool";
```

- [ ] **Step 2: Resolver links, definir o executor e passar as opts**

Em `sendCopyMessageAction`, substituir o bloco:

```ts
  const brandText = compileBrandKnowledge(await listBrandBlocks());
  const reply = await generateCopyReply(history, brandText);

  const { error: e2 } = await supabase
    .from("copy_messages")
    .insert({ chat_id: chatId, role: "assistant", content: reply });
  if (e2) throw new Error(`Falha ao salvar resposta: ${e2.message}`);
```

por:

```ts
  const brandText = compileBrandKnowledge(await listBrandBlocks());
  const linkLabels = (await listLinks()).map((l) => l.label);

  // Executor da tool criar_receita: cria um RASCUNHO (active=false) reusando save_recipe.
  // Vive na action porque toca o banco; o lib/ai só recebe o callback.
  async function onCreateRecipe(
    draft: RecipeDraft,
  ): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
    const v = validateRecipeDraft(draft);
    if (!v.ok) return { ok: false, error: v.error };
    const recipeName = draft.name.trim() || "Receita sem nome";
    const { data: rec, error: eRec } = await supabase
      .from("recipes")
      .insert({ name: recipeName, recipe_type: "custom", active: false })
      .select("id")
      .single();
    if (eRec) return { ok: false, error: `Falha ao criar a receita: ${eRec.message}` };
    const id = rec.id as string;
    const payload = toSaveRecipePayload(draft);
    const { error: eSave } = await supabase.rpc("save_recipe", {
      p_id: id,
      p_name: recipeName,
      p_description: draft.description ?? "",
      p_active: false,
      p_inputs: payload.inputs,
      p_slots: payload.slots,
    });
    if (eSave) {
      await supabase.from("recipes").delete().eq("id", id); // rollback do rascunho órfão
      return { ok: false, error: `Falha ao salvar a receita: ${eSave.message}` };
    }
    return { ok: true, id, name: recipeName };
  }

  const { reply, createdRecipes } = await generateCopyReply(history, brandText, { linkLabels, onCreateRecipe });

  // O link do rascunho é derivado no servidor (não confiado ao texto do modelo).
  const seal = formatRecipeSeal(createdRecipes);
  const finalReply = seal ? `${reply}\n\n${seal}` : reply;

  const { error: e2 } = await supabase
    .from("copy_messages")
    .insert({ chat_id: chatId, role: "assistant", content: finalReply });
  if (e2) throw new Error(`Falha ao salvar resposta: ${e2.message}`);
```

- [ ] **Step 3: Revalidar receitas e retornar a resposta selada**

Ainda em `sendCopyMessageAction`, no fim, substituir:

```ts
  revalidatePath("/copywriter");
  revalidatePath(`/copywriter/${chatId}`);
  return reply;
```

por:

```ts
  if (createdRecipes.length > 0) revalidatePath("/receitas");
  revalidatePath("/copywriter");
  revalidatePath(`/copywriter/${chatId}`);
  return finalReply;
```

- [ ] **Step 4: Typecheck + suíte**

Run: `npx tsc --noEmit` → sem erros (a chamada agora bate com a nova assinatura)
Run: `npx vitest run` → PASS

- [ ] **Step 5: Verificação manual (integração — precisa de `ANTHROPIC_API_KEY`)**

Subir o app (`npm run dev`), abrir uma conversa no copywriter e:
- Pedir "monta uma receita de webinário: convite 1 dia antes às 14h, lembrete no dia de manhã, e um post 13 minutos depois do início da live". Conferir: o modelo chama a tool, a resposta traz o selo "✓ Rascunho de receita criado: … /receitas/<id>", a receita aparece em `/receitas` como **inativa** (rascunho) e **não** em "Nova campanha", abre no editor preenchida (inputs + slots com os offsets certos), e ao **ativar** passa a gerar campanha.
- Pedir uma copy avulsa (ex.: "escreve 3 stories de aquecimento") e confirmar que a tool **não** é chamada e a resposta é texto normal.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/copywriter/actions.ts"
git commit -m "feat: copywriter cria rascunho de receita via tool (executor + selo)"
```

---

## Self-Review

**Spec coverage:**
- ① Tool + `RecipeDraft` + `validateRecipeDraft` + `toSaveRecipePayload` + `formatRecipeSeal` → Task 1. ✔
- ② Laço `tool_use` + tool no array + prompt + nova assinatura/retorno → Task 2. ✔
- ③ Executor (rascunho `active=false` via `save_recipe`) + linkLabels + selo derivado no servidor + revalidate → Task 3. ✔
- ④ UI: nenhuma peça nova; o selo é texto puro no render `whitespace-pre-wrap` (com `CopyButton` já existente) → sem task, decidido no plano. ✔
- Sem migration / rascunho sempre / só criar / lib/ai independente do app → Global Constraints. ✔

**Placeholder scan:** todo step tem código/comando real e output esperado. Sem TBD/TODO. A Task 2 declara o `tsc` vermelho como ponte deliberada até a Task 3.

**Type consistency:** `RecipeDraft` e os helpers (Task 1) são consumidos por `generateCopyReply` (Task 2) e pela action (Task 3) com as mesmas assinaturas. `onCreateRecipe` tem o mesmo shape nos três lugares: `(draft: RecipeDraft) => Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }>`. `generateCopyReply` retorna `{ reply: string; createdRecipes: { id: string; name: string }[] }`, desestruturado na Task 3. O `save_recipe` é chamado com o mesmo shape de payload que `toSaveRecipePayload` produz (mesmos campos do RPC `0023`).
