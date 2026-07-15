# Refino que cria peças novas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o chat "Refinar campanha" realmente ADICIONAR peças novas (toques e posts) — hoje ele só edita as existentes, e peças novas somem em silêncio.

**Architecture:** A IA passa a devolver adições em arrays próprios (`new_touches`/`new_group_posts`) com offset numérico; o servidor resolve a âncora da campanha (via receita), calcula o `send_at`, atribui o `sort_order` do próximo livre, herda os grupos do post-referência, e sela a resposta do assistente com a contagem real inserida. Helpers puros ficam num módulo testável.

**Tech Stack:** Next.js (App Router) + TypeScript + Vitest + Supabase. Copy/PT-BR. IA via `@anthropic-ai/sdk` (Claude), output em json_schema.

## Global Constraints

- **Sem migration.** As colunas já existem (`campaign_touches`/`campaign_group_posts`: `sort_order`, `send_at`, `offset_label`, `template_name`/`message_code`).
- **Sem tocar no caminho de envio.** `rescheduleCampaign` já roda ao fim de `refineCampaignAction` e remonta a fila — nada de mexer em fila/jitter/validação/SendPayload.
- **Só ADICIONAR.** Não recalcular `send_at` de peças editadas (mover data existente é outro trabalho).
- **Escopo do envio inalterado:** peças novas de campanha rascunho não disparam envio (worker só entrega campanha aprovada).
- **Copy/prompt em PT-BR.** Voz do prompt: Lucas Arruda, 1ª pessoa, sem hype; nunca citar "Wesley", preço ou tier.
- **Node vem do nvm:** se `node`/`npx` não existirem, rode antes `export NVM_DIR="$HOME/.nvm"; \. "$NVM_DIR/nvm.sh"`.

---

### Task 1: Helpers puros — `lib/campaign-refine.ts`

Quatro funções puras que a ação de refino vai usar: próximo `sort_order`, grupos herdados, código curto e o selo factual. Isoladas e testáveis.

**Files:**
- Create: `lib/campaign-refine.ts`
- Test: `lib/campaign-refine.test.ts`

**Interfaces:**
- Produces:
  - `nextSortOrder(items: { sort_order: number }[]): number`
  - `pickReferenceGroups(posts: { sort_order: number; community_ids: string[] }[]): string[]`
  - `slugCode(role: string): string`
  - `formatAddedSeal(addedPosts: number, addedTouches: number): string`

- [ ] **Step 1: Escrever os testes que falham**

Criar `lib/campaign-refine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { nextSortOrder, pickReferenceGroups, slugCode, formatAddedSeal } from "@/lib/campaign-refine";

describe("nextSortOrder", () => {
  it("vazio → 0", () => expect(nextSortOrder([])).toBe(0));
  it("sequência → max+1", () =>
    expect(nextSortOrder([{ sort_order: 0 }, { sort_order: 1 }, { sort_order: 2 }])).toBe(3));
  it("com buracos/fora de ordem → max+1", () =>
    expect(nextSortOrder([{ sort_order: 5 }, { sort_order: 2 }])).toBe(6));
});

describe("pickReferenceGroups", () => {
  it("escolhe o post com mais grupos", () =>
    expect(pickReferenceGroups([
      { sort_order: 0, community_ids: ["a"] },
      { sort_order: 1, community_ids: ["a", "b", "c"] },
    ])).toEqual(["a", "b", "c"]));
  it("empate → menor sort_order", () =>
    expect(pickReferenceGroups([
      { sort_order: 2, community_ids: ["x", "y"] },
      { sort_order: 1, community_ids: ["p", "q"] },
    ])).toEqual(["p", "q"]));
  it("nenhum com grupo → []", () =>
    expect(pickReferenceGroups([
      { sort_order: 0, community_ids: [] },
      { sort_order: 1, community_ids: [] },
    ])).toEqual([]));
  it("lista vazia → []", () => expect(pickReferenceGroups([])).toEqual([]));
});

describe("slugCode", () => {
  it("papel → slug", () => expect(slugCode("Convite ao webinário")).toBe("convite-ao-webinario"));
});

describe("formatAddedSeal", () => {
  it("nada → string vazia", () => expect(formatAddedSeal(0, 0)).toBe(""));
  it("posts e toques → plural", () =>
    expect(formatAddedSeal(6, 2)).toBe("✓ 6 posts e 2 toques adicionados.\n\n"));
  it("um post só → singular", () =>
    expect(formatAddedSeal(1, 0)).toBe("✓ 1 post adicionado.\n\n"));
  it("um toque só → singular", () =>
    expect(formatAddedSeal(0, 1)).toBe("✓ 1 toque adicionado.\n\n"));
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/campaign-refine.test.ts`
Expected: FAIL — `Cannot find module '@/lib/campaign-refine'`.

- [ ] **Step 3: Implementar os helpers**

Criar `lib/campaign-refine.ts`:

```ts
import { slugifyIdentifier } from "@/lib/text";

/** Próximo sort_order livre: max + 1, ou 0 se não houver peças. */
export function nextSortOrder(items: { sort_order: number }[]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((i) => i.sort_order)) + 1;
}

/**
 * Grupos que uma peça nova herda: os do post com MAIS grupos selecionados;
 * empate → menor sort_order; [] se nenhum post tiver grupos.
 */
export function pickReferenceGroups(
  posts: { sort_order: number; community_ids: string[] }[],
): string[] {
  let best: { sort_order: number; community_ids: string[] } | null = null;
  for (const p of posts) {
    if (p.community_ids.length === 0) continue;
    if (
      !best ||
      p.community_ids.length > best.community_ids.length ||
      (p.community_ids.length === best.community_ids.length && p.sort_order < best.sort_order)
    ) {
      best = p;
    }
  }
  return best ? best.community_ids : [];
}

/** Código curto p/ buildCode a partir do papel da peça nova. */
export function slugCode(role: string): string {
  return slugifyIdentifier(role);
}

/** Selo factual do que o refino inseriu; "" quando nada foi adicionado. */
export function formatAddedSeal(addedPosts: number, addedTouches: number): string {
  const parts: string[] = [];
  if (addedPosts > 0) parts.push(`${addedPosts} ${addedPosts > 1 ? "posts" : "post"}`);
  if (addedTouches > 0) parts.push(`${addedTouches} ${addedTouches > 1 ? "toques" : "toque"}`);
  if (parts.length === 0) return "";
  const plural = addedPosts + addedTouches > 1;
  return `✓ ${parts.join(" e ")} adicionado${plural ? "s" : ""}.\n\n`;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/campaign-refine.test.ts`
Expected: PASS (todos os `describe`).

- [ ] **Step 5: Suíte inteira**

Run: `npx vitest run`
Expected: PASS — total sobe pelos novos testes.

- [ ] **Step 6: Commit**

```bash
git add lib/campaign-refine.ts lib/campaign-refine.test.ts
git commit -m "feat: helpers do refino (nextSortOrder, pickReferenceGroups, slugCode, seal)"
```

---

### Task 2: Schema e tipos das peças novas — `lib/ai/refine-schema.ts`, `lib/ai/refine.ts`

A IA passa a poder devolver adições. Adicionar dois arrays ao schema e os tipos correspondentes ao `RefineResult`.

**Files:**
- Modify: `lib/ai/refine-schema.ts` (adicionar `new_touches`/`new_group_posts` em `properties` e `required`)
- Modify: `lib/ai/refine.ts` (tipos `NewTouch`/`NewGroupPost` + campos em `RefineResult`)

**Interfaces:**
- Produces (em `lib/ai/refine.ts`):
  - `type NewTouch = { offset_label: string; offset_days: number; offset_time: string; role: string; meta_category: "UTILITY" | "MARKETING"; template_body: string; buttons: { type: "quick_reply" | "url"; text: string; url: string }[]; window_steps: { media: string; caption: string }[]; fallback_copy: string; crm_action: string; risk_flag: boolean }`
  - `type NewGroupPost = { offset_label: string; offset_days: number; offset_time: string; role: string; communities: string; copy: string; media: string }`
  - `RefineResult` ganha `new_touches: NewTouch[]` e `new_group_posts: NewGroupPost[]`.

- [ ] **Step 1: Adicionar os arrays ao schema**

Em `lib/ai/refine-schema.ts`, no objeto raiz: trocar a linha `required`:

```ts
  required: ["reply", "touch_updates", "group_post_updates"],
```

por:

```ts
  required: ["reply", "touch_updates", "group_post_updates", "new_touches", "new_group_posts"],
```

E, dentro de `properties`, logo após o fechamento do array `group_post_updates` (antes do `}` que fecha `properties`), inserir:

```ts
    new_touches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["offset_label", "offset_days", "offset_time", "role", "meta_category", "template_body", "buttons", "window_steps", "fallback_copy", "crm_action", "risk_flag"],
        properties: {
          offset_label: { type: "string" },
          offset_days: { type: "integer" },
          offset_time: { type: "string" },
          role: { type: "string" },
          meta_category: { type: "string", enum: ["UTILITY", "MARKETING"] },
          template_body: { type: "string" },
          buttons: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type", "text", "url"],
              properties: {
                type: { type: "string", enum: ["quick_reply", "url"] },
                text: { type: "string" },
                url: { type: "string" },
              },
            },
          },
          window_steps: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["media", "caption"],
              properties: { media: { type: "string" }, caption: { type: "string" } },
            },
          },
          fallback_copy: { type: "string" },
          crm_action: { type: "string" },
          risk_flag: { type: "boolean" },
        },
      },
    },
    new_group_posts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["offset_label", "offset_days", "offset_time", "role", "communities", "copy", "media"],
        properties: {
          offset_label: { type: "string" },
          offset_days: { type: "integer" },
          offset_time: { type: "string" },
          role: { type: "string" },
          communities: { type: "string" },
          copy: { type: "string" },
          media: { type: "string" },
        },
      },
    },
```

- [ ] **Step 2: Adicionar os tipos**

Em `lib/ai/refine.ts`, logo após o `type GroupPostUpdate = {...}` (antes de `type RefineResult`), inserir:

```ts
export type NewTouch = {
  offset_label: string;
  offset_days: number;
  offset_time: string;
  role: string;
  meta_category: "UTILITY" | "MARKETING";
  template_body: string;
  buttons: { type: "quick_reply" | "url"; text: string; url: string }[];
  window_steps: { media: string; caption: string }[];
  fallback_copy: string;
  crm_action: string;
  risk_flag: boolean;
};

export type NewGroupPost = {
  offset_label: string;
  offset_days: number;
  offset_time: string;
  role: string;
  communities: string;
  copy: string;
  media: string;
};
```

E, no `type RefineResult`, adicionar os dois campos:

```ts
export type RefineResult = {
  reply: string;
  touch_updates: TouchUpdate[];
  group_post_updates: GroupPostUpdate[];
  new_touches: NewTouch[];
  new_group_posts: NewGroupPost[];
};
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Suíte**

Run: `npx vitest run`
Expected: PASS — nenhum teste depende do schema literal.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/refine-schema.ts lib/ai/refine.ts
git commit -m "feat: schema e tipos das pecas novas no refino (new_touches/new_group_posts)"
```

---

### Task 3: Prompt e passagem da âncora — `lib/ai/refine-prompt.ts`, `lib/ai/refine.ts`, `actions.ts`

Ensinar a IA a adicionar (e a não mentir), dando a ela a âncora e o `send_at` de cada peça. Isso exige plumbing: `refineCampaignAction` resolve a âncora e passa por `refineCampaign` até `buildRefinePrompt`.

**Files:**
- Modify: `lib/ai/refine-prompt.ts` (assinatura + conteúdo)
- Modify: `lib/ai/refine.ts` (`refineCampaign` recebe e repassa âncora)
- Modify: `app/(app)/campanhas/actions.ts` (`refineCampaignAction` resolve a âncora via receita e passa)

**Interfaces:**
- Consumes: `getRecipe`, `computeSendAt`, `buildCode` (já importados em `actions.ts`); `RecipeWithChildren` (de `getRecipe`).
- Produces:
  - `buildRefinePrompt(campaign, userMessage, brandText, anchorLabel: string, anchorValue: string): string`
  - `refineCampaign(campaign, userMessage, brandText, anchorLabel: string, anchorValue: string): Promise<RefineResult>`
  - Em `refineCampaignAction`: variáveis `recipe` (`RecipeWithChildren | null`), `anchorLabel: string`, `anchorValue: string` disponíveis no escopo (consumidas pela Task 4).

- [ ] **Step 1: Atualizar `buildRefinePrompt`**

Em `lib/ai/refine-prompt.ts`, trocar a assinatura e o corpo. Substituir a função inteira por:

```ts
import type { CampaignWithContent } from "@/lib/db/types";

export function buildRefinePrompt(
  campaign: CampaignWithContent,
  userMessage: string,
  brandText: string,
  anchorLabel: string,
  anchorValue: string,
): string {
  const touches = campaign.touches
    .map(
      (t) =>
        `- [API] sort_order ${t.sort_order} · ${t.offset_label} · envia ${t.send_at || "—"} · ${t.role} · ${t.meta_category}\n  template: ${t.template_body}\n  botões: ${t.buttons.map((b) => b.type === "url" ? `${b.text} → ${b.url}` : b.text).join(" | ")}\n  janela: ${t.window_steps.map((w) => `${w.media}: ${w.caption}`).join(" / ")}\n  fallback: ${t.fallback_copy}\n  crm: ${t.crm_action} · risco: ${t.risk_flag}`,
    )
    .join("\n");
  const posts = campaign.group_posts
    .map(
      (p) =>
        `- [GRUPOS] sort_order ${p.sort_order} · ${p.offset_label} · envia ${p.send_at || "—"} · ${p.role} · comunidades ${p.communities}\n  copy: ${p.copy}\n  mídia: ${p.media}`,
    )
    .join("\n");

  return `# Base de conhecimento da marca\n${brandText}\n\n# Âncora da campanha\n${anchorLabel || "(sem âncora)"}: ${anchorValue || "(não informada)"}\nCada peça é agendada por um offset em dias relativo a esta âncora (negativo = antes). Compare o "envia" de cada peça com a âncora para inferir o offset atual.\n\n# Estado atual da campanha "${campaign.name}"\n## Trilha API individual\n${touches}\n\n## Trilha Grupos\n${posts}\n\n# Pedido do usuário\n${userMessage}\n\nAplique SÓ o que o pedido pede, respeitando as regras da marca.\n\n- Para EDITAR uma peça existente: devolva o objeto COMPLETO em touch_updates/group_post_updates com o MESMO sort_order. Não inclua peças que você não alterou.\n- Para ADICIONAR peças novas: use new_touches/new_group_posts. Cada peça nova precisa de offset_days (int, negativo = antes da âncora), offset_time ("HH:mm") e offset_label (rótulo humano coerente, ex. "D-7"). NÃO invente sort_order para peças novas — o sistema atribui.\n- No reply (chat curto), relate APENAS o que você de fato devolveu: quantas peças adicionadas e quantas editadas. Nunca afirme ter criado algo que não está em new_touches/new_group_posts.`;
}
```

- [ ] **Step 2: `refineCampaign` recebe e repassa a âncora**

Em `lib/ai/refine.ts`, atualizar a assinatura e a chamada a `buildRefinePrompt`. Trocar:

```ts
export async function refineCampaign(
  campaign: CampaignWithContent,
  userMessage: string,
  brandText: string,
): Promise<RefineResult> {
```

por:

```ts
export async function refineCampaign(
  campaign: CampaignWithContent,
  userMessage: string,
  brandText: string,
  anchorLabel: string,
  anchorValue: string,
): Promise<RefineResult> {
```

E na montagem de `messages`, trocar:

```ts
    messages: [{ role: "user", content: buildRefinePrompt(campaign, userMessage, brandText) }],
```

por:

```ts
    messages: [{ role: "user", content: buildRefinePrompt(campaign, userMessage, brandText, anchorLabel, anchorValue) }],
```

- [ ] **Step 3: `refineCampaignAction` resolve a âncora e passa**

Em `app/(app)/campanhas/actions.ts`, dentro de `refineCampaignAction`, trocar o bloco:

```ts
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campanha não encontrada.");
  const brandText = compileBrandKnowledge(await listBrandBlocks());

  const result = await refineCampaign(campaign, trimmed, brandText);
```

por:

```ts
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campanha não encontrada.");
  const brandText = compileBrandKnowledge(await listBrandBlocks());

  // A âncora vem da receita (input is_anchor) + os valores da campanha. Necessária
  // para datar peças novas; a receita pode ter sido apagada (recipe_id null).
  const recipe = campaign.recipe_id ? await getRecipe(campaign.recipe_id) : null;
  const anchorLabel = recipe?.inputs.find((i) => i.is_anchor)?.label ?? "";
  const anchorValue = anchorLabel ? (campaign.inputs[anchorLabel] ?? "") : "";

  const result = await refineCampaign(campaign, trimmed, brandText, anchorLabel, anchorValue);
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (a chamada a `refineCampaign` e a `buildRefinePrompt` já batem com as novas assinaturas).

- [ ] **Step 5: Ajustar o teste do prompt para a nova assinatura**

`lib/ai/refine-prompt.test.ts:18` chama `buildRefinePrompt` com 3 args e vai quebrar (typecheck e runtime). Trocar a linha 18:

```ts
    const out = buildRefinePrompt(campaign, "reescreve o toque 1 mais agressivo", "BASE_WAY");
```

por (passando a âncora e cobrindo o novo comportamento):

```ts
    const out = buildRefinePrompt(campaign, "reescreve o toque 1 mais agressivo", "BASE_WAY", "Data e hora do webinário", "2026-06-27 19:00");
```

E adicionar, dentro do mesmo `it` (após a última `expect` da linha 24), duas asserções do comportamento novo:

```ts
    expect(out).toContain("2026-06-27 19:00"); // âncora no prompt
    expect(out).toContain("new_group_posts"); // instrução de adicionar peças
```

- [ ] **Step 6: Suíte**

Run: `npx vitest run`
Expected: PASS — o teste do prompt atualizado passa; nenhum outro teste chama `buildRefinePrompt`/`refineCampaign`.

- [ ] **Step 7: Commit**

```bash
git add lib/ai/refine-prompt.ts lib/ai/refine.ts lib/ai/refine-prompt.test.ts "app/(app)/campanhas/actions.ts"
git commit -m "feat: refino recebe a ancora e ensina a IA a adicionar pecas (sem mentir)"
```

---

### Task 4: Inserir as peças novas — `app/(app)/campanhas/actions.ts`

Com a IA já devolvendo `new_touches`/`new_group_posts` e a âncora resolvida (Task 3), inserir as peças novas: `sort_order` do próximo livre, `send_at` calculado, código via `buildCode`, herança de grupos, e o selo factual na resposta.

**Files:**
- Modify: `app/(app)/campanhas/actions.ts` (`refineCampaignAction`)

**Interfaces:**
- Consumes: `nextSortOrder`, `pickReferenceGroups`, `slugCode`, `formatAddedSeal` (Task 1); `computeSendAt`, `buildCode` (já importados); `recipe`/`anchorLabel`/`anchorValue` (Task 3); `result.new_touches`/`result.new_group_posts` (Task 2).

- [ ] **Step 1: Importar os helpers**

Em `app/(app)/campanhas/actions.ts`, adicionar o import (junto aos outros imports de `@/lib`):

```ts
import { nextSortOrder, pickReferenceGroups, slugCode, formatAddedSeal } from "@/lib/campaign-refine";
```

- [ ] **Step 2: Inserir as peças novas e computar as contagens**

Em `refineCampaignAction`, logo APÓS o loop que aplica `group_post_updates` (o bloco que termina em `if (error) throw new Error(\`Falha ao atualizar post ${sort_order}...\`)`) e ANTES de persistir a reply do assistente, inserir:

```ts
  // Peças novas precisam da âncora para datar; sem ela, não inserimos peça quebrada.
  const hasNew = result.new_touches.length > 0 || result.new_group_posts.length > 0;
  if (hasNew && !anchorValue) {
    throw new Error("Não consigo datar peças novas sem a âncora da campanha. Confira a receita.");
  }

  let addedTouches = 0;
  let addedPosts = 0;

  if (result.new_touches.length > 0) {
    let so = nextSortOrder(campaign.touches);
    const rows = result.new_touches.map((t) => {
      const { offset_days, offset_time, ...fields } = t;
      return {
        campaign_id: campaignId,
        sort_order: so++,
        ...fields,
        template_name: buildCode(recipe?.recipe_type ?? "", slugCode(t.role), anchorValue),
        send_at: computeSendAt(anchorValue, offset_days, offset_time),
      };
    });
    const { error } = await supabase.from("campaign_touches").insert(rows);
    if (error) throw new Error(`Falha ao adicionar toques: ${error.message}`);
    addedTouches = rows.length;
  }

  if (result.new_group_posts.length > 0) {
    const inheritedGroups = pickReferenceGroups(campaign.group_posts);
    let so = nextSortOrder(campaign.group_posts);
    const rows = result.new_group_posts.map((p) => {
      const { offset_days, offset_time, ...fields } = p;
      return {
        campaign_id: campaignId,
        sort_order: so++,
        ...fields,
        message_code: buildCode(recipe?.recipe_type ?? "", slugCode(p.role), anchorValue),
        send_at: computeSendAt(anchorValue, offset_days, offset_time),
      };
    });
    const { data: inserted, error } = await supabase
      .from("campaign_group_posts")
      .insert(rows)
      .select("id");
    if (error) throw new Error(`Falha ao adicionar posts: ${error.message}`);
    addedPosts = rows.length;

    const posts = inserted ?? [];
    if (inheritedGroups.length > 0 && posts.length > 0) {
      const links = posts.flatMap((row) =>
        inheritedGroups.map((community_id) => ({ post_id: row.id as string, community_id })),
      );
      const { error: eLink } = await supabase.from("campaign_group_post_communities").insert(links);
      if (eLink) throw new Error(`Falha ao vincular grupos das peças novas: ${eLink.message}`);
    }
  }
```

- [ ] **Step 3: Selar a reply com a contagem real**

Ainda em `refineCampaignAction`, computar a reply final e usá-la tanto na persistência quanto no retorno. Trocar o bloco que persiste a reply do assistente:

```ts
  // Persiste reply do assistente
  const { error: e2 } = await supabase.from("chat_messages").insert({
    campaign_id: campaignId,
    role: "assistant",
    content: result.reply,
  });
  if (e2) throw new Error(`Falha ao salvar reply do assistente: ${e2.message}`);
```

por:

```ts
  // Selo factual: o que foi REALMENTE inserido, não o que a IA disse.
  const finalReply = formatAddedSeal(addedPosts, addedTouches) + result.reply;

  // Persiste reply do assistente
  const { error: e2 } = await supabase.from("chat_messages").insert({
    campaign_id: campaignId,
    role: "assistant",
    content: finalReply,
  });
  if (e2) throw new Error(`Falha ao salvar reply do assistente: ${e2.message}`);
```

E, no fim da função, trocar o retorno `return result.reply;` por:

```ts
  return finalReply;
```

(O `rescheduleCampaign(campaignId)` logo antes do retorno permanece — remonta a fila já com as peças novas.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Suíte**

Run: `npx vitest run`
Expected: PASS — a mudança é na server action (não coberta por unit); nenhum teste existente quebra.

- [ ] **Step 6: Verificação manual (integração — precisa de `ANTHROPIC_API_KEY` + Supabase)**

Numa campanha **rascunho**, no chat "Refinar campanha", pedir: "adicione 1 post por dia de D-7 a D-2, aquecendo até o anúncio". Conferir:
- O cabeçalho sobe (ex.: 14 → 20 posts).
- As peças novas aparecem na Lista com data correta (D-7…D-2, **antes** da âncora) e já mirando os grupos herdados do post-referência.
- O selo do chat ("✓ 6 posts adicionados.") bate com o que foi inserido.
- Um pedido que só edita uma peça existente continua funcionando (sem adicionar nada, sem selo).

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/campanhas/actions.ts"
git commit -m "feat: refino insere pecas novas (send_at, sort_order, heranca de grupos, selo)"
```

---

## Self-Review

**Spec coverage:**
- ① Schema `new_touches`/`new_group_posts` → Task 2. ✔
- ② Tipos + `RefineResult` → Task 2. ✔
- ③ Prompt (âncora + `send_at` por peça + instrução adicionar/relatar) → Task 3. ✔
- ④ Ação: resolver âncora (Task 3) + inserir peças, `send_at`, `sort_order`, `buildCode`, herança de grupos, selo factual (Task 4). ✔
- Erro claro quando faltar âncora e houver peças novas → Task 4, Step 2. ✔
- Helpers puros testáveis (`nextSortOrder`, `pickReferenceGroups`, `slugCode`) + `formatAddedSeal` → Task 1. ✔
- Sem migration / sem tocar no envio → Global Constraints, respeitado em todas as tasks. ✔

**Placeholder scan:** todo step tem código/comando real e output esperado. Sem TBD/TODO.

**Type consistency:**
- `NewTouch`/`NewGroupPost` (Task 2) carregam `offset_days`/`offset_time`; a Task 4 desestrutura exatamente esses dois campos e espalha o resto (`...fields`) nas colunas — que casam com `campaign_touches`/`campaign_group_posts`. ✔
- `nextSortOrder(items: { sort_order: number }[])` — `campaign.touches`/`campaign.group_posts` têm `sort_order: number`. ✔
- `pickReferenceGroups(posts: { sort_order; community_ids }[])` — `CampaignGroupPost` tem `sort_order` e `community_ids: string[]`. ✔
- `buildRefinePrompt`/`refineCampaign` ganham `anchorLabel`/`anchorValue` (Task 3) e são chamadas com esses args na mesma task. ✔
- `formatAddedSeal(addedPosts, addedTouches)` (Task 1) consumida na Task 4 com as contagens reais. ✔
