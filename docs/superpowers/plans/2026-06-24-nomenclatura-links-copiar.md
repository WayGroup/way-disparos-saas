# Nomenclatura + Links na campanha + "Ao vivo" + Copiar por bloco — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No fluxo de webinário: escolher links salvos na campanha, trocar o "30 min antes" por "ao vivo", dar um nome padronizado (`tipo_papel_DDMM`) a cada toque/post, e botões de copiar por bloco pro Infra.

**Architecture:** Nomenclatura computada em código (não pela IA) a partir de um `code` por slot da receita + a data da âncora; novos campos `template_name`/`message_code` nas tabelas de campanha. Picker de links reusa a biblioteca `/links`. Botões de copiar via componente client compartilhado. Mudanças de cadência são dados (SQL).

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase Postgres, Tailwind v4, Vitest, `@anthropic-ai/sdk`.

## Global Constraints

- UI/erros em PT-BR. Tailwind v4 (tokens já em `@theme`). Node em `/tmp/node-v22.16.0-darwin-arm64/bin` — exporte no PATH. Nenhum dev server durante `npm run build`.
- Supabase project_id **`gtctjfoitstbjkzpfpgk`**. Migração de schema via MCP `mcp__claude_ai_Supabase__apply_migration` + arquivo em `supabase/migrations/`; updates de dados via `mcp__claude_ai_Supabase__execute_sql` (carregue ambas com ToolSearch). Policies/colunas idempotentes (`if not exists`).
- Nomenclatura: **`tipo_papel_DDMM`** (ex.: `webinar_convite_2306`), para API **e** Grupos.
- `template_name`/`message_code` são computados em código e editáveis à mão; **NÃO** entram em `GENERATION_SCHEMA`/`REFINE_SCHEMA` (o refino preserva o nome).
- Atualização por `(campaign_id, sort_order)` — manter o padrão existente. TDD nos utilitários puros; commits frequentes.

---

### Task 1: Schema + tipos + helper `buildCode`

**Files:**
- Create: `supabase/migrations/0007_nomenclatura.sql`
- Modify: `lib/db/types.ts` (`RecipeSlot.code`, `CampaignTouch.template_name`, `CampaignGroupPost.message_code`)
- Create: `lib/ai/nomenclature.ts`
- Test: `lib/ai/nomenclature.test.ts`

**Interfaces:**
- Consumes: nada anterior.
- Produces:
  - Colunas `recipe_slots.code`, `campaign_touches.template_name`, `campaign_group_posts.message_code`.
  - Tipos atualizados.
  - `buildCode(recipeType: string, slotCode: string, anchor: string): string` em `lib/ai/nomenclature.ts`.

- [ ] **Step 1: Teste falhando de `buildCode`**

Create `lib/ai/nomenclature.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildCode } from "@/lib/ai/nomenclature";

describe("buildCode", () => {
  it("monta tipo_papel_DDMM a partir da âncora datetime-local", () => {
    expect(buildCode("webinario", "convite", "2026-06-23T19:07")).toBe("webinario_convite_2306");
  });
  it("normaliza o code (minúsculo, sem espaços/acentos)", () => {
    expect(buildCode("webinario", "É Hoje", "2026-06-23T19:07")).toBe("webinario_e-hoje_2306");
  });
  it("sem data quando a âncora é vazia/ inválida", () => {
    expect(buildCode("promo", "abertura", "")).toBe("promo_abertura");
    expect(buildCode("promo", "abertura", "xx")).toBe("promo_abertura");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npm test -- lib/ai/nomenclature.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar `lib/ai/nomenclature.ts`**

```ts
import { slugifyIdentifier } from "@/lib/text";

export function buildCode(recipeType: string, slotCode: string, anchor: string): string {
  const base = `${slugifyIdentifier(recipeType)}_${slugifyIdentifier(slotCode)}`;
  const d = anchor ? new Date(anchor) : null;
  if (!d || Number.isNaN(d.getTime())) return base;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base}_${pad(d.getDate())}${pad(d.getMonth() + 1)}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- lib/ai/nomenclature.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Atualizar tipos em `lib/db/types.ts`**

No tipo `RecipeSlot`, adicione `code` após `track`:
```ts
  code: string;
```
No tipo `CampaignTouch`, adicione após `id/campaign_id/sort_order` (qualquer posição):
```ts
  template_name: string;
```
No tipo `CampaignGroupPost`, adicione:
```ts
  message_code: string;
```

- [ ] **Step 6: Criar a migração de schema**

Create `supabase/migrations/0007_nomenclatura.sql`:
```sql
alter table public.recipe_slots add column if not exists code text not null default '';
alter table public.campaign_touches add column if not exists template_name text not null default '';
alter table public.campaign_group_posts add column if not exists message_code text not null default '';
```

- [ ] **Step 7: Aplicar a migração**

Carregue `select:mcp__claude_ai_Supabase__apply_migration,mcp__claude_ai_Supabase__execute_sql` (ToolSearch). Aplique com `project_id` = `gtctjfoitstbjkzpfpgk`, `name` = `nomenclatura`, `query` = conteúdo exato do arquivo. Verifique:
```sql
select column_name from information_schema.columns
where table_name in ('recipe_slots','campaign_touches','campaign_group_posts')
  and column_name in ('code','template_name','message_code');
```
Expected: 3 linhas. Mostre o resultado real.

- [ ] **Step 8: Validar tipos + testes**

Run: `npx tsc --noEmit && npm test`
Expected: tsc limpo; testes verdes.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: schema de nomenclatura (slot code, template_name, message_code) + buildCode"
```

---

### Task 2: Dados — codes dos slots, inputs de link, slot "ao vivo"

**Files:**
- (Sem arquivos de código — atualização de dados via MCP `execute_sql`.)

**Interfaces:**
- Consumes: colunas da Task 1.
- Produces: receitas Webinário/Promo com `code` por slot; inputs de link com `field_type='link'`; slot 3 da API do Webinário = "ao vivo".

- [ ] **Step 1: Atualizar a receita Webinário (codes + ao vivo + field_type link)**

Carregue `select:mcp__claude_ai_Supabase__execute_sql`. Rode (o id da receita Webinário é resolvido por `recipe_type='webinario'`):
```sql
do $$
declare wid uuid := (select id from recipes where recipe_type='webinario' limit 1);
begin
  -- inputs de link viram field_type 'link'
  update recipe_inputs set field_type='link'
   where recipe_id=wid and label in ('Link da sala (Google Meet)', 'Link da Sessão Estratégica');

  -- API: codes + troca do "30 min" por "ao vivo" (sort_order 2)
  update recipe_slots set code='convite' where recipe_id=wid and track='api' and sort_order=0;
  update recipe_slots set code='ehoje'   where recipe_id=wid and track='api' and sort_order=1;
  update recipe_slots set
    offset_label='D0 · 19h07 (ao vivo)',
    role='Estamos ao vivo — entre agora',
    meta_category='UTILITY',
    suggested_media='Header de texto + botão com link da sala',
    code='aovivo'
   where recipe_id=wid and track='api' and sort_order=2;

  -- Grupos: codes por sort_order (cadência real)
  update recipe_slots set code='anuncio'      where recipe_id=wid and track='grupos' and sort_order=0;
  update recipe_slots set code='prova'        where recipe_id=wid and track='grupos' and sort_order=1;
  update recipe_slots set code='vespera'      where recipe_id=wid and track='grupos' and sort_order=2;
  update recipe_slots set code='ehoje'        where recipe_id=wid and track='grupos' and sort_order=3;
  update recipe_slots set code='virada'       where recipe_id=wid and track='grupos' and sort_order=4;
  update recipe_slots set code='2horas'       where recipe_id=wid and track='grupos' and sort_order=5;
  update recipe_slots set code='link'         where recipe_id=wid and track='grupos' and sort_order=6;
  update recipe_slots set code='aovivo'       where recipe_id=wid and track='grupos' and sort_order=7;
  update recipe_slots set code='pressao'      where recipe_id=wid and track='grupos' and sort_order=8;
  update recipe_slots set code='insight'      where recipe_id=wid and track='grupos' and sort_order=9;
  update recipe_slots set code='sessao-vagas' where recipe_id=wid and track='grupos' and sort_order=10;
  update recipe_slots set code='reta-final'   where recipe_id=wid and track='grupos' and sort_order=11;
  update recipe_slots set code='sessao-ultima' where recipe_id=wid and track='grupos' and sort_order=12;
  update recipe_slots set code='encerra'      where recipe_id=wid and track='grupos' and sort_order=13;
end $$;
```

- [ ] **Step 2: Atualizar a receita Promo (codes)**

```sql
do $$
declare pid uuid := (select id from recipes where recipe_type='promo' limit 1);
begin
  update recipe_slots set code='abertura' where recipe_id=pid and track='api' and sort_order=0;
  update recipe_slots set code='reforco'  where recipe_id=pid and track='api' and sort_order=1;
  update recipe_slots set code='ultima'   where recipe_id=pid and track='api' and sort_order=2;
end $$;
```

- [ ] **Step 3: Verificar**

```sql
select track, sort_order, code, role, meta_category
from recipe_slots
where recipe_id=(select id from recipes where recipe_type='webinario' limit 1)
order by track, sort_order;
```
Expected: API tem codes convite/ehoje/aovivo (o 3º é "Estamos ao vivo — entre agora", UTILITY); grupos têm os 14 codes. Mostre o resultado real.

- [ ] **Step 4: Commit (registro — sem arquivos de código)**

```bash
git commit --allow-empty -m "chore: dados — codes dos slots, inputs de link, slot ao vivo (via MCP)"
```

---

### Task 3: Nomenclatura na geração + edição manual

**Files:**
- Modify: `app/(app)/campanhas/actions.ts`

**Interfaces:**
- Consumes: `buildCode` (`@/lib/ai/nomenclature`), `RecipeWithChildren`/`RecipeSlot` (`@/lib/db/types`), `generateCampaign` (já importado).
- Produces:
  - `generateCampaignAction` grava `template_name`/`message_code` nos inserts.
  - `TouchFields.template_name` e `PostFields.message_code` (edição manual).

- [ ] **Step 1: Importar `buildCode`**

Em `app/(app)/campanhas/actions.ts`, adicione no topo (junto dos outros imports):
```ts
import { buildCode } from "@/lib/ai/nomenclature";
```

- [ ] **Step 2: Computar e gravar os nomes na geração**

Em `generateCampaignAction`, **depois** de `const content = await generateCampaign(recipe, inputs, brandText);` e **antes** dos inserts, compute as listas de slots e o valor da âncora:
```ts
  const anchorLabel = recipe.inputs.find((i) => i.is_anchor)?.label;
  const anchorValue = anchorLabel ? (inputs[anchorLabel] ?? "") : "";
  const apiSlots = recipe.slots.filter((s) => s.track === "api");
  const gruposSlots = recipe.slots.filter((s) => s.track === "grupos");
```
Troque o insert de `campaign_touches` para incluir `template_name`:
```ts
  if (content.touches.length > 0) {
    const { error: e1 } = await supabase.from("campaign_touches").insert(
      content.touches.map((t, idx) => ({
        campaign_id: campaignId,
        sort_order: idx,
        template_name: buildCode(recipe.recipe_type, apiSlots[idx]?.code ?? "", anchorValue),
        ...t,
      })),
    );
    if (e1) throw new Error(`Falha ao salvar toques: ${e1.message}`);
  }
```
Troque o insert de `campaign_group_posts` para incluir `message_code`:
```ts
  if (content.group_posts.length > 0) {
    const { error: e2 } = await supabase.from("campaign_group_posts").insert(
      content.group_posts.map((p, idx) => ({
        campaign_id: campaignId,
        sort_order: idx,
        message_code: buildCode(recipe.recipe_type, gruposSlots[idx]?.code ?? "", anchorValue),
        ...p,
      })),
    );
    if (e2) throw new Error(`Falha ao salvar posts: ${e2.message}`);
  }
```

- [ ] **Step 3: Adicionar os campos editáveis aos tipos de update**

No `app/(app)/campanhas/actions.ts`, em `TouchFields` adicione:
```ts
  template_name: string;
```
Em `PostFields` adicione:
```ts
  message_code: string;
```
(As funções `updateTouchAction`/`updateGroupPostAction` já fazem `.update(fields)`, então passam a persistir os novos campos automaticamente.)

- [ ] **Step 4: Validar tipos + testes**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm test`
Expected: tsc limpo; testes verdes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: computa template_name/message_code na geração + edição manual"
```

---

### Task 4: Picker de links na nova campanha

**Files:**
- Modify: `app/(app)/campanhas/nova/page.tsx`
- Modify: `app/(app)/campanhas/nova/_components/new-campaign-form.tsx`

**Interfaces:**
- Consumes: `listLinks` (`@/lib/db/links`), `StandardLink` (`@/lib/db/types`).
- Produces: inputs com `field_type='link'` renderizam dropdown dos links salvos + "colar URL".

- [ ] **Step 1: Carregar os links e passar ao form**

Replace `app/(app)/campanhas/nova/page.tsx`:
```tsx
import { listRecipes, getRecipe } from "@/lib/db/recipes";
import { listLinks } from "@/lib/db/links";
import type { RecipeWithChildren } from "@/lib/db/types";
import { NewCampaignForm } from "./_components/new-campaign-form";

export default async function NovaCampanhaPage() {
  const recipes = await listRecipes();
  const detailed = (await Promise.all(recipes.filter((r) => r.active).map((r) => getRecipe(r.id))))
    .filter((r): r is RecipeWithChildren => r !== null);
  const links = await listLinks();
  return (
    <div className="p-8 max-w-3xl">
      <div className="font-mono text-xs uppercase tracking-widest text-muted">Passo 1 de 1</div>
      <h1 className="font-display font-bold text-3xl mt-1 mb-6">Nova campanha</h1>
      <NewCampaignForm recipes={detailed} links={links} />
    </div>
  );
}
```

- [ ] **Step 2: Renderizar o picker de link no form**

Em `app/(app)/campanhas/nova/_components/new-campaign-form.tsx`:

(a) Atualize o import de tipos e a assinatura:
```tsx
import type { RecipeWithChildren, StandardLink } from "@/lib/db/types";
```
```tsx
export function NewCampaignForm({ recipes, links }: { recipes: RecipeWithChildren[]; links: StandardLink[] }) {
```

(b) Substitua o bloco que renderiza `recipe.inputs.map(...)` por uma versão que trata `field_type==='link'`:
```tsx
          {recipe.inputs.map((i) => {
            if (i.field_type === "link") {
              const savedLinks = links.filter((l) => l.url);
              const current = values[i.label] ?? "";
              const isCustom = current !== "" && !savedLinks.some((l) => l.url === current);
              return (
                <label key={i.id} className="block">
                  <span className="text-xs font-mono uppercase tracking-wide text-muted">{i.label}</span>
                  <select
                    value={isCustom ? "__custom__" : current}
                    onChange={(e) => {
                      const v = e.target.value;
                      setValues((prev) => ({ ...prev, [i.label]: v === "__custom__" ? "" : v }));
                    }}
                    className="mt-1 w-full rounded-lg border border-line bg-white p-2.5 text-sm outline-none focus:border-emerald"
                  >
                    <option value="">— escolher link salvo —</option>
                    {savedLinks.map((l) => (
                      <option key={l.id} value={l.url}>{l.label}</option>
                    ))}
                    <option value="__custom__">Outro (colar URL)…</option>
                  </select>
                  {(isCustom || (current === "" && false)) && (
                    <input
                      type="url" value={current} placeholder="https://…"
                      onChange={(e) => setValues((prev) => ({ ...prev, [i.label]: e.target.value }))}
                      className="mt-2 w-full rounded-lg border border-line p-2.5 text-sm outline-none focus:border-emerald"
                    />
                  )}
                </label>
              );
            }
            const inputType = i.field_type === "data_hora" ? "datetime-local" : i.field_type === "url" ? "url" : "text";
            return (
              <label key={i.id} className="block">
                <span className="text-xs font-mono uppercase tracking-wide text-muted">{i.label}{i.is_anchor ? " ⚓ (âncora da cadência)" : ""}</span>
                <input
                  type={inputType}
                  value={values[i.label] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [i.label]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-line p-2.5 text-sm outline-none focus:border-emerald"
                />
              </label>
            );
          })}
```
> Nota: quando o usuário seleciona "Outro (colar URL)…", `values[label]` fica `""` e o `<input type="url">` aparece para digitar; ao digitar, `isCustom` passa a `true` e o input continua visível.

- [ ] **Step 3: Validar build + testes**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm run build && npm test`
Expected: tsc limpo; build OK; testes verdes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: picker de links salvos (+ colar URL) na nova campanha"
```

---

### Task 5: Botão de copiar + nome do template nos cards

**Files:**
- Create: `app/(app)/campanhas/[id]/_components/copy-button.tsx`
- Modify: `app/(app)/campanhas/[id]/_components/touch-card.tsx`
- Modify: `app/(app)/campanhas/[id]/_components/post-card.tsx`

**Interfaces:**
- Consumes: tipos `CampaignTouch`/`CampaignGroupPost` (já com `template_name`/`message_code`), `TouchFields`/`PostFields` (com os novos campos).
- Produces: `CopyButton` reutilizável; cards mostram o nome + botões copiar; edição manual do nome.

- [ ] **Step 1: Criar `copy-button.tsx`**

Create `app/(app)/campanhas/[id]/_components/copy-button.tsx`:
```tsx
"use client";
import { useState } from "react";

export function CopyButton({ text, label = "copiar", className = "" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { if (!text) return; navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      disabled={!text}
      className={`font-mono text-[10px] uppercase tracking-wide text-emeraldd hover:underline disabled:opacity-40 ${className}`}
    >
      {copied ? "copiado ✓" : label}
    </button>
  );
}
```

- [ ] **Step 2: Usar nome + copiar no `touch-card.tsx`**

Em `app/(app)/campanhas/[id]/_components/touch-card.tsx`:

(a) Import + estado: adicione no topo
```tsx
import { CopyButton } from "./copy-button";
```
e inclua `template_name` no estado inicial `f` (junto dos outros campos):
```tsx
    template_name: touch.template_name,
```

(b) No **modo leitura**, logo abaixo do cabeçalho (a `div` com offset/role/categoria), adicione a linha do nome do template:
```tsx
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-xs bg-paper border border-line rounded px-2 py-0.5">{touch.template_name || "— sem nome —"}</span>
          <CopyButton text={touch.template_name} label="copiar nome" />
        </div>
```

(c) Adicione um `CopyButton` em cada bloco. No bloco **Template** (depois dos botões), no bloco **Janela** (por passo), no bloco **Fallback** e no rodapé **CRM**:
- Template: depois da `<div>` dos `buttons`, adicione
```tsx
          <div className="mt-2 flex gap-3"><CopyButton text={touch.template_body} label="copiar texto" /><CopyButton text={touch.buttons.join("\n")} label="copiar botões" /></div>
```
- Janela: troque o `map` dos `window_steps` para incluir copiar por passo
```tsx
            {touch.window_steps.map((w, wi) => (
              <div key={wi} className="flex items-center justify-between gap-2">
                <p className="text-sm mt-1 leading-relaxed"><span className="font-medium">{w.media}:</span> {w.caption}</p>
                <CopyButton text={`${w.media}: ${w.caption}`} />
              </div>
            ))}
```
- Fallback: depois do `<p>` do fallback
```tsx
            <CopyButton text={touch.fallback_copy} className="mt-1" />
```
- CRM (rodapé): ao lado de "CRM: …"
```tsx
            <CopyButton text={touch.crm_action} label="copiar crm" />
```

(d) No **modo edição**, adicione um input para `template_name` (perto do `role`):
```tsx
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Nome do template</span><input value={f.template_name} onChange={(e) => setF({ ...f, template_name: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" /></label>
```

- [ ] **Step 3: Usar código + copiar no `post-card.tsx`**

Em `app/(app)/campanhas/[id]/_components/post-card.tsx`:

(a) Import + estado: adicione
```tsx
import { CopyButton } from "./copy-button";
```
e inclua no estado inicial `f`:
```tsx
    message_code: post.message_code,
```

(b) No **modo leitura**, abaixo do cabeçalho adicione o código + copiar, e botões de copiar na mensagem/comunidades/mídia:
```tsx
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-xs bg-paper border border-line rounded px-2 py-0.5">{post.message_code || "— sem código —"}</span>
          <CopyButton text={post.message_code} label="copiar código" />
        </div>
```
Na linha de comunidades, adicione ao lado:
```tsx
          <CopyButton text={post.communities} />
```
Depois do `<p>` da `copy` e da linha de mídia:
```tsx
          <div className="mt-2 flex gap-3"><CopyButton text={post.copy} label="copiar mensagem" /><CopyButton text={post.media} label="copiar mídia" /></div>
```

(c) No **modo edição**, adicione input para `message_code`:
```tsx
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Código da mensagem</span><input value={f.message_code} onChange={(e) => setF({ ...f, message_code: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" /></label>
```

- [ ] **Step 4: Validar build + testes**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm run build && npm test`
Expected: tsc limpo; build OK; testes verdes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: nome do template/código + botões de copiar por bloco nos cards"
```

---

### Task 6: Campo "código" por slot no editor de receita

**Files:**
- Modify: `app/(app)/receitas/actions.ts` (`SaveSlot.code` + insert)
- Modify: `app/(app)/receitas/[id]/_components/recipe-editor.tsx`

**Interfaces:**
- Consumes: tipos de slot.
- Produces: editor de receita mostra/edita `code` por slot; `saveRecipeAction` persiste.

- [ ] **Step 1: Adicionar `code` ao `SaveSlot` e ao insert**

Em `app/(app)/receitas/actions.ts`, no tipo `SaveSlot` adicione:
```ts
  code: string;
```
O `saveRecipeAction` já faz `insert(... ,sort_order: idx)` espalhando os campos do slot; confirme que o objeto inserido inclui `code` (se o insert lista campos explicitamente, adicione `code: s.code`; se faz `...s`, já está coberto). Garanta que `code` seja gravado.

- [ ] **Step 2: Estado inicial + input no editor**

Em `app/(app)/receitas/[id]/_components/recipe-editor.tsx`:

(a) No mapeamento inicial de `slots` (de `recipe.slots` para `SaveSlot[]`), inclua `code: s.code`.

(b) Em cada linha de slot (tanto API quanto Grupos), adicione um campo "código" (use uma coluna do grid existente, ou acrescente):
```tsx
                <label className="col-span-2"><span className="text-[10px] font-mono uppercase text-muted">Código</span><input value={s.code} onChange={(e) => patchSlot(idx, { code: e.target.value })} placeholder="ex.: convite" className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" /></label>
```
> Ajuste os `col-span` da linha para caber o novo campo (some os spans para somar 12). Mantenha o padrão visual existente.

(c) Ao adicionar um novo slot (botões "+ Adicionar slot"), inclua `code: ""` no objeto inicial do slot.

- [ ] **Step 3: Validar build + testes**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm run build && npm test`
Expected: tsc limpo; build OK; testes verdes.

- [ ] **Step 4: Verificação manual (com dev server + ANTHROPIC_API_KEY)**

`npm run dev` → logar → **Links** (preencher URLs) → **Nova campanha → Webinário**: inputs de link mostram dropdown + "colar URL"; data pelo seletor; gerar → 3º template é "ao vivo"; cada toque/post mostra o nome `webinar_<papel>_2306` com botão copiar; copiar funciona; editar nome manualmente salva; refino preserva o nome. Em **Receitas → editar**, cada slot tem campo "código".

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: campo código por slot no editor de receita"
```

---

## Self-Review (preenchido)

- **Cobertura do plano de design:** (1) picker de links ✓ Task 4; (2) "ao vivo" ✓ Task 2; (3) copiar por bloco ✓ Task 5; (4) nomenclatura ✓ Tasks 1-3 (schema/helper/geração) + Task 6 (code no editor). Tudo coberto.
- **Placeholders:** nenhum "TBD"/"TODO"; todo passo tem código/SQL/comando concreto.
- **Consistência de tipos:** `RecipeSlot.code`/`CampaignTouch.template_name`/`CampaignGroupPost.message_code` (Task 1) usados em Tasks 3-6; `buildCode(recipeType, slotCode, anchor)` (Task 1) consumido na Task 3; `TouchFields.template_name`/`PostFields.message_code` (Task 3) consumidos pelos cards (Task 5); `SaveSlot.code` (Task 6) consistente com `RecipeSlot.code`. `template_name`/`message_code` NÃO entram nos schemas de IA (refino preserva).
- **Nota:** `buildCode` usa `new Date()` (código de app normal, não workflow) — ok. A geração e o refino seguem chamando o Claude em Server Action (~30-60s; dívida de deploy já registrada).
