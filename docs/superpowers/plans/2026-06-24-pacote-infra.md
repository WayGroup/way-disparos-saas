# Pacote Infra: agenda real, botões estruturados, mídia vinculada, duplicar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar 4 melhorias operacionais pro Infra: horário real por peça (agenda), botões de template estruturados (resposta rápida/URL), mídia anexada ao arquivo real da biblioteca, e duplicar campanha com nova data.

**Architecture:** Agenda e nomenclatura computadas em código a partir de `offset_days`/`offset_time` por slot + a data-âncora; botões viram objetos `{type,text,url}` ponta a ponta (tipo, IA, UI); mídia anexada manualmente via `asset_id`; duplicar reusa `buildCode`/`computeSendAt` recalculando pra nova âncora.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase Postgres, Tailwind v4, Vitest, `@anthropic-ai/sdk`.

## Global Constraints

- UI/erros em PT-BR. Node em `/tmp/node-v22.16.0-darwin-arm64/bin` — `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH` antes de npm/npx. Nenhum dev server durante `npm run build`.
- Supabase project_id **`gtctjfoitstbjkzpfpgk`**. Schema via MCP `apply_migration` + arquivo em `supabase/migrations/`; dados via `execute_sql` (carregue com ToolSearch `select:mcp__claude_ai_Supabase__apply_migration,mcp__claude_ai_Supabase__execute_sql`). Colunas idempotentes (`if not exists`).
- `send_at` é texto "YYYY-MM-DD HH:mm" (sem timezone). `template_name`/`message_code`/`send_at`/`asset_id` são computados/manuais — **NÃO** entram em `GENERATION_SCHEMA`/`REFINE_SCHEMA` (refino preserva).
- Botões: só `quick_reply` e `url`. Atualização por `(campaign_id, sort_order)` — manter. TDD nos utilitários puros; commits frequentes.

---

### Task 1: Schema aditivo + tipos + helpers de agenda

**Files:**
- Create: `supabase/migrations/0008_infra_pack.sql`
- Modify: `lib/db/types.ts`
- Create: `lib/schedule.ts`, `lib/schedule.test.ts`
- Modify (fixtures que quebram): `lib/ai/prompt.test.ts`, `lib/ai/refine-prompt.test.ts`, `lib/recipes/slots.test.ts` (só onde objetos `RecipeSlot`/`CampaignTouch`/`CampaignGroupPost` precisam dos novos campos)

**Interfaces:**
- Produces: colunas `recipe_slots.offset_days/offset_time`, `campaign_touches.send_at`, `campaign_group_posts.send_at/asset_id`; tipos atualizados (sem mexer em `buttons` ainda); `computeSendAt(anchor, offsetDays, offsetTime): string` e `formatSendAt(value): string` em `lib/schedule.ts`.

- [ ] **Step 1: Testes falhando de schedule**

Create `lib/schedule.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeSendAt, formatSendAt } from "@/lib/schedule";

describe("computeSendAt", () => {
  it("soma dias e usa hora fixa", () => {
    expect(computeSendAt("2026-06-27T19:00", -1, "14:00")).toBe("2026-06-26 14:00");
  });
  it("hora vazia usa a hora da âncora", () => {
    expect(computeSendAt("2026-06-27T19:07", 0, "")).toBe("2026-06-27 19:07");
  });
  it("âncora inválida retorna vazio", () => {
    expect(computeSendAt("", -1, "14:00")).toBe("");
    expect(computeSendAt("xx", 0, "")).toBe("");
  });
});

describe("formatSendAt", () => {
  it("formata em pt-BR curto", () => {
    expect(formatSendAt("2026-06-26 14:00")).toBe("sex 26/06 · 14:00");
  });
  it("vazio retorna vazio", () => {
    expect(formatSendAt("")).toBe("");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npm test -- lib/schedule.test.ts`
Expected: FAIL (import não resolve).

- [ ] **Step 3: Implementar `lib/schedule.ts`**

```ts
export function computeSendAt(anchor: string, offsetDays: number, offsetTime: string): string {
  if (!anchor) return "";
  const d = new Date(anchor);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + offsetDays);
  let hh = d.getHours();
  let mm = d.getMinutes();
  if (offsetTime && /^\d{1,2}:\d{2}$/.test(offsetTime)) {
    const [h, m] = offsetTime.split(":").map(Number);
    hh = h;
    mm = m;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(hh)}:${pad(mm)}`;
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function formatSendAt(value: string): string {
  if (!value) return "";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!m) return value;
  const [, y, mo, d, hh, mm] = m;
  const dow = new Date(Number(y), Number(mo) - 1, Number(d)).getDay();
  return `${DIAS[dow]} ${d}/${mo} · ${hh}:${mm}`;
}
```
> Confira que 2026-06-26 cai numa sexta (getDay()=5 → "sex"); se o teste falhar por dia da semana, ajuste a data esperada no teste para o dia real (mantenha a lógica).

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- lib/schedule.test.ts`
Expected: PASS.

- [ ] **Step 5: Atualizar tipos em `lib/db/types.ts`**

Em `RecipeSlot` adicione (após `code`):
```ts
  offset_days: number;
  offset_time: string;
```
Em `CampaignTouch` adicione `send_at: string;` e troque `window_steps` para:
```ts
  window_steps: { media: string; caption: string; asset_id?: string }[];
```
Em `CampaignGroupPost` adicione:
```ts
  send_at: string;
  asset_id: string | null;
```
(NÃO mexa em `buttons` nesta task.)

- [ ] **Step 6: Criar a migração**

Create `supabase/migrations/0008_infra_pack.sql`:
```sql
alter table public.recipe_slots add column if not exists offset_days int not null default 0;
alter table public.recipe_slots add column if not exists offset_time text not null default '';
alter table public.campaign_touches add column if not exists send_at text not null default '';
alter table public.campaign_group_posts add column if not exists send_at text not null default '';
alter table public.campaign_group_posts add column if not exists asset_id uuid references public.assets(id) on delete set null;
```

- [ ] **Step 7: Aplicar a migração**

Carregue `select:mcp__claude_ai_Supabase__apply_migration,mcp__claude_ai_Supabase__execute_sql`. Aplique (`project_id` `gtctjfoitstbjkzpfpgk`, `name` `infra_pack`, `query` = conteúdo do arquivo). Verifique:
```sql
select table_name, column_name from information_schema.columns
where (table_name='recipe_slots' and column_name in ('offset_days','offset_time'))
   or (table_name='campaign_touches' and column_name='send_at')
   or (table_name='campaign_group_posts' and column_name in ('send_at','asset_id'))
order by table_name, column_name;
```
Expected: 5 linhas. Mostre o resultado real.

- [ ] **Step 8: Corrigir fixtures e validar**

Rode `npx tsc --noEmit`; onde objetos literais de `RecipeSlot`/`CampaignTouch`/`CampaignGroupPost` faltarem os novos campos obrigatórios, adicione os defaults (`offset_days: 0`, `offset_time: ""`, `send_at: ""`, `asset_id: null`). Depois:
Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm test`
Expected: tsc limpo; testes verdes.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: schema agenda/mídia (offset_days/time, send_at, asset_id) + helpers de agenda"
```

---

### Task 2: Botões estruturados (ponta a ponta)

**Files:**
- Modify: `lib/db/types.ts` (`CampaignTouch.buttons`), `lib/ai/schema.ts`, `lib/ai/refine-schema.ts`, `lib/ai/prompt.ts`
- Modify: `app/(app)/campanhas/actions.ts` (`TouchFields.buttons`)
- Modify: `app/(app)/campanhas/[id]/_components/touch-card.tsx`
- Modify (fixtures): `lib/ai/prompt.test.ts`, `lib/ai/refine-prompt.test.ts` (e qualquer um que use `buttons` como `string[]`)
- Dados (MCP `execute_sql`): conversão dos botões existentes

**Interfaces:**
- Consumes: tipos da Task 1.
- Produces: `buttons` é `{ type: "quick_reply" | "url"; text: string; url: string }[]` em todo o fluxo (tipo, schemas IA, geração, UI).

- [ ] **Step 1: Tipo + TouchFields**

Em `lib/db/types.ts`, troque em `CampaignTouch`:
```ts
  buttons: { type: "quick_reply" | "url"; text: string; url: string }[];
```
Em `app/(app)/campanhas/actions.ts`, troque em `TouchFields`:
```ts
  buttons: { type: "quick_reply" | "url"; text: string; url: string }[];
```

- [ ] **Step 2: GENERATION_SCHEMA + REFINE_SCHEMA**

Em `lib/ai/schema.ts`, troque o `buttons` (dentro de `touches.items.properties`) por:
```ts
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
```
Em `lib/ai/refine-schema.ts`, aplique a MESMA troca no `buttons` dentro de `touch_updates` (mantendo `additionalProperties:false` e `buttons` em `required`).

- [ ] **Step 3: Prompt**

Em `lib/ai/prompt.ts`, no `SYSTEM_PROMPT`, adicione antes de "Responda APENAS...":
```
- Botões dos templates da API: cada botão é {type, text, url}. Use type "quick_reply" (texto curto que volta como clique, url="") ou "url" (abre link — preencha url com uma URL informada nos inputs/links, NUNCA invente). No máximo 3 botões curtos por template.
```

- [ ] **Step 4: Converter dados existentes (MCP execute_sql)**

```sql
update campaign_touches set buttons = coalesce((
  select jsonb_agg(jsonb_build_object('type','quick_reply','text', e, 'url',''))
  from jsonb_array_elements_text(buttons) e), '[]'::jsonb)
where jsonb_typeof(buttons)='array' and (buttons='[]'::jsonb or jsonb_typeof(buttons->0)='string');
```
Verifique com:
```sql
select id, buttons from campaign_touches limit 5;
```
Mostre o resultado (botões agora objetos ou `[]`).

- [ ] **Step 5: UI — `touch-card.tsx`**

LEIA o arquivo. No **modo leitura**, troque a renderização dos botões (hoje chips de string) por uma lista onde cada botão mostra ícone do tipo + texto + (se url) o link, com `CopyButton`:
```tsx
{touch.buttons.map((b, bi) => (
  <span key={bi} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-xs">
    <span>{b.type === "url" ? "🔗" : "↩"}</span>
    <span>{b.text}</span>
    {b.type === "url" && b.url && <a href={b.url} target="_blank" rel="noreferrer" className="text-emeraldd underline truncate max-w-[160px]">{b.url}</a>}
  </span>
))}
```
Mantenha o `CopyButton text={...}` dos botões trocando para `touch.buttons.map((b) => b.type === "url" ? `${b.text} → ${b.url}` : b.text).join("\n")`.

No **modo edição**, troque o input único de botões (split por vírgula) por um mini-repetidor sobre `f.buttons`: para cada botão, um `<select>` de tipo (quick_reply/url), um input de texto, e um input de URL visível só quando `type === "url"`; mais um botão "+ adicionar botão" e um "remover" por linha. Exemplo de uma linha:
```tsx
{f.buttons.map((b, bi) => (
  <div key={bi} className="flex gap-2 items-center">
    <select value={b.type} onChange={(e) => setF({ ...f, buttons: f.buttons.map((x, i) => i === bi ? { ...x, type: e.target.value as "quick_reply" | "url" } : x) })} className="rounded-lg border border-line p-1.5 text-xs">
      <option value="quick_reply">resposta rápida</option>
      <option value="url">URL</option>
    </select>
    <input value={b.text} onChange={(e) => setF({ ...f, buttons: f.buttons.map((x, i) => i === bi ? { ...x, text: e.target.value } : x) })} placeholder="texto do botão" className="flex-1 rounded-lg border border-line p-1.5 text-xs" />
    {b.type === "url" && <input value={b.url} onChange={(e) => setF({ ...f, buttons: f.buttons.map((x, i) => i === bi ? { ...x, url: e.target.value } : x) })} placeholder="https://…" className="flex-1 rounded-lg border border-line p-1.5 text-xs" />}
    <button type="button" onClick={() => setF({ ...f, buttons: f.buttons.filter((_, i) => i !== bi) })} className="text-xs text-muted hover:text-risk">×</button>
  </div>
))}
<button type="button" onClick={() => setF({ ...f, buttons: [...f.buttons, { type: "quick_reply", text: "", url: "" }] })} className="text-xs text-emeraldd hover:underline">+ adicionar botão</button>
```
Garanta que o estado inicial `f` continua incluindo `buttons: touch.buttons` (o tipo já bate).

- [ ] **Step 6: Corrigir fixtures + validar**

`npx tsc --noEmit` — corrija fixtures que usam `buttons: ["..."]` para o novo formato `[{ type: "quick_reply", text: "...", url: "" }]`. Depois:
Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm run build && npm test`
Expected: tsc limpo; build OK; testes verdes.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: botões de template estruturados (quick_reply/url) ponta a ponta"
```

---

### Task 3: Agenda na geração + display + editor de receita

**Files:**
- Modify: `app/(app)/campanhas/actions.ts` (`generateCampaignAction`)
- Modify: `app/(app)/campanhas/[id]/_components/touch-card.tsx`, `post-card.tsx` (mostrar `send_at`)
- Modify: `app/(app)/receitas/actions.ts` (`SaveSlot`), `app/(app)/receitas/[id]/_components/recipe-editor.tsx`
- Dados (MCP `execute_sql`): popular `offset_days`/`offset_time`

**Interfaces:**
- Consumes: `computeSendAt`/`formatSendAt` (`@/lib/schedule`), colunas da Task 1.
- Produces: toques/posts gravam `send_at`; cards exibem; receita edita `offset_days`/`offset_time`.

- [ ] **Step 1: Geração computa send_at**

Em `app/(app)/campanhas/actions.ts`, importe:
```ts
import { computeSendAt } from "@/lib/schedule";
```
No insert de `campaign_touches`, adicione `send_at` (após `template_name`):
```ts
        send_at: computeSendAt(anchorValue, apiSlots[idx]?.offset_days ?? 0, apiSlots[idx]?.offset_time ?? ""),
```
No insert de `campaign_group_posts`, adicione (após `message_code`):
```ts
        send_at: computeSendAt(anchorValue, gruposSlots[idx]?.offset_days ?? 0, gruposSlots[idx]?.offset_time ?? ""),
```

- [ ] **Step 2: Cards exibem send_at**

Em `touch-card.tsx` e `post-card.tsx`, importe `formatSendAt` de `@/lib/schedule` e `CopyButton`. No cabeçalho (modo leitura), ao lado de `offset_label`, mostre quando houver `send_at`:
```tsx
{touch.send_at && (
  <span className="inline-flex items-center gap-2 font-mono text-xs bg-emerald/10 text-emeraldd rounded px-2 py-0.5">
    📅 {formatSendAt(touch.send_at)}
    <CopyButton text={touch.send_at} />
  </span>
)}
```
(No `post-card.tsx` use `post.send_at`.)

- [ ] **Step 3: SaveSlot + editor de receita**

Em `app/(app)/receitas/actions.ts`, em `SaveSlot` adicione `offset_days: number;` e `offset_time: string;` (o insert usa spread `...s`, então já grava; confirme). Em `recipe-editor.tsx`: inclua `offset_days: s.offset_days` e `offset_time: s.offset_time` no mapeamento inicial; nos handlers de "adicionar slot" inclua `offset_days: 0, offset_time: ""`; e por slot, adicione dois campos no grid:
```tsx
<label className="col-span-1"><span className="text-[10px] font-mono uppercase text-muted">Dias</span><input type="number" value={s.offset_days} onChange={(e) => patchSlot(idx, { offset_days: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
<label className="col-span-1"><span className="text-[10px] font-mono uppercase text-muted">Hora</span><input value={s.offset_time} onChange={(e) => patchSlot(idx, { offset_time: e.target.value })} placeholder="14:00" className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" /></label>
```
Ajuste os `col-span` da linha do slot para fechar 12 (reduza outro campo se preciso). Use o nome real do helper de patch lido no arquivo.

- [ ] **Step 4: Popular offset nos slots (MCP execute_sql)**

API do Webinário (valores explícitos):
```sql
do $$
declare wid uuid := (select id from recipes where recipe_type='webinario' limit 1);
begin
  update recipe_slots set offset_days=-1, offset_time='14:00' where recipe_id=wid and track='api' and sort_order=0;
  update recipe_slots set offset_days=0,  offset_time='09:00' where recipe_id=wid and track='api' and sort_order=1;
  update recipe_slots set offset_days=0,  offset_time=''      where recipe_id=wid and track='api' and sort_order=2;
end $$;
```
Grupos do Webinário: leia os `offset_label` atuais com `select sort_order, offset_label from recipe_slots where recipe_id=(select id from recipes where recipe_type='webinario') and track='grupos' order by sort_order;` e gere updates por `sort_order` aplicando a regra: "D-1"→offset_days=-1, "D0"→0; hora extraída do rótulo ("19h07"→"19:07", "20h30"→"20:30"); sem hora → ''. Rode os updates. Mostre o resultado final (`select sort_order, offset_label, offset_days, offset_time ...`).

- [ ] **Step 5: Validar**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm run build && npm test`
Expected: tsc limpo; build OK; testes verdes.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: agenda real (send_at) na geração + display + offset por slot no editor"
```

---

### Task 4: Mídia vinculada (anexo manual)

**Files:**
- Create: `app/(app)/campanhas/[id]/_components/media-picker.tsx`
- Modify: `app/(app)/campanhas/[id]/page.tsx`, `_components/campaign-view.tsx`, `touch-card.tsx`, `post-card.tsx`
- Modify: `app/(app)/campanhas/actions.ts` (novas actions)

**Interfaces:**
- Consumes: `listAssets` (`@/lib/db/assets`), `Asset` (`@/lib/db/types`), colunas da Task 1 (`asset_id` em posts; `asset_id` em window_steps JSONB).
- Produces: `setTouchStepAssetAction(campaignId, sortOrder, stepIndex, assetId)`, `setPostAssetAction(campaignId, sortOrder, assetId)`; `MediaPicker`.

- [ ] **Step 1: Actions de anexo**

Em `app/(app)/campanhas/actions.ts` adicione:
```ts
export async function setTouchStepAssetAction(campaignId: string, sortOrder: number, stepIndex: number, assetId: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("campaign_touches").select("window_steps").eq("campaign_id", campaignId).eq("sort_order", sortOrder).single();
  if (error) throw new Error(`Falha ao carregar toque: ${error.message}`);
  const steps = ((data?.window_steps ?? []) as { media: string; caption: string; asset_id?: string }[]).map((s, i) => i === stepIndex ? { ...s, asset_id: assetId } : s);
  const { error: e2 } = await supabase.from("campaign_touches").update({ window_steps: steps }).eq("campaign_id", campaignId).eq("sort_order", sortOrder);
  if (e2) throw new Error(`Falha ao anexar mídia: ${e2.message}`);
  revalidatePath(`/campanhas/${campaignId}`);
}

export async function setPostAssetAction(campaignId: string, sortOrder: number, assetId: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("campaign_group_posts").update({ asset_id: assetId || null }).eq("campaign_id", campaignId).eq("sort_order", sortOrder);
  if (error) throw new Error(`Falha ao anexar mídia: ${error.message}`);
  revalidatePath(`/campanhas/${campaignId}`);
}
```

- [ ] **Step 2: `MediaPicker`**

Create `app/(app)/campanhas/[id]/_components/media-picker.tsx`:
```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Asset } from "@/lib/db/types";
import { CopyButton } from "./copy-button";

function publicUrl(storagePath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${storagePath}`;
}

export function MediaPicker({ assets, currentId, onPick }: { assets: Asset[]; currentId: string | null; onPick: (assetId: string) => Promise<void> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = assets.find((a) => a.id === currentId) ?? null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <select
        value={currentId ?? ""}
        disabled={pending}
        onChange={(e) => startTransition(async () => { await onPick(e.target.value); router.refresh(); })}
        className="rounded-lg border border-line bg-white p-1.5 text-xs"
      >
        <option value="">— anexar mídia da biblioteca —</option>
        {assets.map((a) => <option key={a.id} value={a.id}>{a.filename}</option>)}
      </select>
      {current && (
        <>
          <a href={publicUrl(current.storage_path)} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-emeraldd underline truncate max-w-[200px]">{current.filename}</a>
          <CopyButton text={publicUrl(current.storage_path)} label="copiar link" />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Carregar assets e propagar**

Em `app/(app)/campanhas/[id]/page.tsx`: importe `listAssets`, faça `const assets = await listAssets();` e passe `assets` para `<CampaignView ... assets={assets} />`. Em `campaign-view.tsx`: aceite `assets: Asset[]` na prop e repasse `assets={assets}` para cada `<TouchCard />` e `<PostCard />`.

- [ ] **Step 4: Picker nos cards**

Em `touch-card.tsx` (aceitar `assets` na prop): em cada `window_step` do modo leitura, abaixo do caption, renderize:
```tsx
<MediaPicker assets={assets} currentId={w.asset_id ?? null} onPick={(id) => setTouchStepAssetAction(campaignId, touch.sort_order, wi, id)} />
```
Em `post-card.tsx` (aceitar `assets`): abaixo da mídia sugerida:
```tsx
<MediaPicker assets={assets} currentId={post.asset_id} onPick={(id) => setPostAssetAction(campaignId, post.sort_order, id)} />
```
Importe `MediaPicker` e as actions nos dois.

- [ ] **Step 5: Validar**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm run build && npm test`
Expected: tsc limpo; build OK; testes verdes.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: mídia vinculada — anexar asset real da biblioteca a passos e posts"
```

---

### Task 5: Duplicar campanha (clona + nova data)

**Files:**
- Create: `app/(app)/campanhas/[id]/_components/duplicate-button.tsx`
- Modify: `app/(app)/campanhas/actions.ts` (`duplicateCampaignAction`), `app/(app)/campanhas/[id]/_components/campaign-view.tsx`

**Interfaces:**
- Consumes: `getCampaign` (`@/lib/db/campaigns`), `getRecipe` (`@/lib/db/recipes`), `buildCode` (`@/lib/ai/nomenclature`), `computeSendAt` (`@/lib/schedule`).
- Produces: `duplicateCampaignAction(campaignId, newAnchor, newName): Promise<string>`; botão "Duplicar".

- [ ] **Step 1: `duplicateCampaignAction`**

Em `app/(app)/campanhas/actions.ts` adicione (importe `getCampaign` já está; importe `getRecipe` já está):
```ts
export async function duplicateCampaignAction(campaignId: string, newAnchor: string, newName: string): Promise<string> {
  const src = await getCampaign(campaignId);
  if (!src) throw new Error("Campanha não encontrada.");
  const recipe = src.recipe_id ? await getRecipe(src.recipe_id) : null;

  const anchorLabel = recipe?.inputs.find((i) => i.is_anchor)?.label;
  const inputs = { ...src.inputs };
  if (anchorLabel && newAnchor) inputs[anchorLabel] = newAnchor;
  const anchorValue = anchorLabel ? (inputs[anchorLabel] ?? "") : "";
  const apiSlots = recipe?.slots.filter((s) => s.track === "api") ?? [];
  const gruposSlots = recipe?.slots.filter((s) => s.track === "grupos") ?? [];

  const supabase = await createServerSupabase();
  const { data: campaign, error } = await supabase.from("campaigns")
    .insert({ recipe_id: src.recipe_id, name: newName.trim() || `${src.name} (cópia)`, inputs })
    .select("id").single();
  if (error) throw new Error(`Falha ao duplicar campanha: ${error.message}`);
  const newId = campaign.id as string;

  if (src.touches.length > 0) {
    const { error: e1 } = await supabase.from("campaign_touches").insert(src.touches.map((t, idx) => ({
      campaign_id: newId, sort_order: t.sort_order,
      offset_label: t.offset_label, role: t.role, meta_category: t.meta_category,
      template_body: t.template_body, buttons: t.buttons, window_steps: t.window_steps,
      fallback_copy: t.fallback_copy, crm_action: t.crm_action, risk_flag: t.risk_flag,
      template_name: recipe ? buildCode(recipe.recipe_type, apiSlots[idx]?.code ?? "", anchorValue) : t.template_name,
      send_at: recipe ? computeSendAt(anchorValue, apiSlots[idx]?.offset_days ?? 0, apiSlots[idx]?.offset_time ?? "") : t.send_at,
    })));
    if (e1) throw new Error(`Falha ao duplicar toques: ${e1.message}`);
  }
  if (src.group_posts.length > 0) {
    const { error: e2 } = await supabase.from("campaign_group_posts").insert(src.group_posts.map((p, idx) => ({
      campaign_id: newId, sort_order: p.sort_order,
      offset_label: p.offset_label, role: p.role, communities: p.communities,
      copy: p.copy, media: p.media, asset_id: p.asset_id,
      message_code: recipe ? buildCode(recipe.recipe_type, gruposSlots[idx]?.code ?? "", anchorValue) : p.message_code,
      send_at: recipe ? computeSendAt(anchorValue, gruposSlots[idx]?.offset_days ?? 0, gruposSlots[idx]?.offset_time ?? "") : p.send_at,
    })));
    if (e2) throw new Error(`Falha ao duplicar posts: ${e2.message}`);
  }
  revalidatePath("/campanhas");
  return newId;
}
```

- [ ] **Step 2: `DuplicateButton`**

Create `app/(app)/campanhas/[id]/_components/duplicate-button.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { duplicateCampaignAction } from "../../actions";

export function DuplicateButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState("");
  const [pending, startTransition] = useTransition();
  if (!open) {
    return <button onClick={() => setOpen(true)} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-paper">Duplicar</button>;
  }
  return (
    <div className="flex items-center gap-2">
      <input type="datetime-local" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="rounded-lg border border-line p-1.5 text-sm" />
      <button disabled={pending} onClick={() => startTransition(async () => { const id = await duplicateCampaignAction(campaignId, anchor, ""); router.push(`/campanhas/${id}`); })} className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50">{pending ? "Duplicando…" : "Duplicar nesta data"}</button>
      <button onClick={() => setOpen(false)} className="text-sm text-muted">cancelar</button>
    </div>
  );
}
```

- [ ] **Step 3: Wire no header**

Em `campaign-view.tsx`, importe `DuplicateButton` e coloque `<DuplicateButton campaignId={campaign.id} />` no header, ao lado do botão "Aprovar campanha".

- [ ] **Step 4: Validar**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm run build && npm test`
Expected: tsc limpo; build OK; testes verdes.

- [ ] **Step 5: Verificação manual (dev server + ANTHROPIC_API_KEY)**

`npm run dev` → logar → Nova campanha → Webinário → gerar: ver `send_at` por peça e botões com tipo/URL. Anexar mídia num passo e num post (link copiável). No header, "Duplicar" → nova data → nova campanha com nomes/agenda recalculados. Em Receitas → editar, cada slot tem "Dias"/"Hora".

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: duplicar campanha com nova data (recalcula nomenclatura e agenda)"
```

---

## Self-Review (preenchido)

- **Cobertura:** item 1 (agenda) → Tasks 1+3; item 2 (botões) → Task 2; item 4 (mídia) → Task 4; item 5 (duplicar) → Task 5. Tudo coberto.
- **Placeholders:** nenhum — todo passo tem código/SQL/comando concreto. As edições de JSX nos cards pedem leitura do arquivo, mas trazem o markup exato a inserir.
- **Consistência de tipos:** `buttons` `{type,text,url}[]` definido na Task 2 e usado em schema/refine/UI/TouchFields juntos (mesma task → tsc verde). `send_at`/`offset_days`/`offset_time`/`asset_id` (Task 1) consumidos nas Tasks 3-5. `computeSendAt`/`buildCode` reusados na geração (Task 3) e na duplicação (Task 5). `MediaPicker`/actions (Task 4) usados pelos cards. `send_at`/`asset_id`/botões manuais NÃO entram nos schemas de IA (refino preserva).
- **Nota:** `buttons` muda de shape — a Task 2 troca tipo + todos os consumidores + dados na mesma task para terminar verde. A conversão de dados (string→objeto) roda junto com o código que lê o novo shape.
