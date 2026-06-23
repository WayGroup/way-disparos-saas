# Motor de Geração — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O coração do produto — escolher uma receita, preencher inputs, **gerar a campanha com Claude** (estrutura Template → Janela 24h → Fallback + posts de grupo) e **visualizar** na trilha de cadência.

**Architecture:** Tabelas `campaigns` / `campaign_touches` / `campaign_group_posts` no Supabase. A geração roda numa **Server Action** que compila a base de conhecimento + o esqueleto da receita + os inputs, chama o **Claude (`@anthropic-ai/sdk`, `claude-opus-4-8`) com saída estruturada** (`output_config.format`), valida e persiste. Visualização em Server Component + um client component para as abas de trilha. Edição/refino ficam para o Plano 6.

**Tech Stack:** Next.js 16 (App Router, Server Actions), `@anthropic-ai/sdk`, Supabase Postgres, Tailwind v4, Vitest.

## Global Constraints

- UI/erros em PT-BR.
- IA: **`@anthropic-ai/sdk`**, modelo **`claude-opus-4-8`**, saída estruturada via `output_config.format` (JSON schema com `additionalProperties: false` e `required` em todo objeto). A `ANTHROPIC_API_KEY` é lida do ambiente **só no servidor** — nunca no browser.
- Guardrails de copy (do spec): 1ª pessoa do Lucas Arruda; SEM Wesley, SEM preço, SEM tier; template leve terminando em clique de botão; mídia persuasiva só na janela 24h; fallback nunca queima o lead; CTA sempre = Sessão Estratégica gratuita.
- Tailwind v4 (tokens já em `@theme`). Supabase project_id **`gtctjfoitstbjkzpfpgk`**; migrações via MCP `apply_migration` + arquivo em `supabase/migrations/`. Policies idempotentes.
- Org única; RLS libera autenticados. Node em `/tmp/node-v22.16.0-darwin-arm64/bin`. Nenhum dev server durante `npm run build`. TDD nos utilitários puros; commits frequentes.

---

### Task 1: Schema de campanhas + tipos + compileBrandKnowledge

**Files:**
- Create: `supabase/migrations/0004_campaigns.sql`
- Modify: `lib/db/types.ts` (adiciona `Campaign`, `CampaignTouch`, `CampaignGroupPost`, `CampaignWithContent`)
- Create: `lib/ai/brand.ts`
- Test: `lib/ai/brand.test.ts`

**Interfaces:**
- Consumes: `BrandBlock` (`@/lib/db/types`).
- Produces:
  - Tabelas `public.campaigns`, `public.campaign_touches`, `public.campaign_group_posts`.
  - Tipos `Campaign`, `CampaignTouch`, `CampaignGroupPost`, `CampaignWithContent`.
  - `compileBrandKnowledge(blocks: BrandBlock[]): string` em `lib/ai/brand.ts`.

- [ ] **Step 1: Teste falhando de `compileBrandKnowledge`**

Create `lib/ai/brand.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { compileBrandKnowledge } from "@/lib/ai/brand";
import type { BrandBlock } from "@/lib/db/types";

function block(p: Partial<BrandBlock>): BrandBlock {
  return { id: "b", block_key: "k", title: "T", content: "C", sort_order: 0, updated_at: "", ...p };
}

describe("compileBrandKnowledge", () => {
  it("junta blocos como seções título + conteúdo, na ordem recebida", () => {
    const out = compileBrandKnowledge([
      block({ title: "Marca", content: "Way Group" }),
      block({ title: "Restrições", content: "Sem Wesley" }),
    ]);
    expect(out).toContain("## Marca\nWay Group");
    expect(out).toContain("## Restrições\nSem Wesley");
    expect(out.indexOf("Marca")).toBeLessThan(out.indexOf("Restrições"));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npm test -- lib/ai/brand.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar `lib/ai/brand.ts`**

```ts
import type { BrandBlock } from "@/lib/db/types";

export function compileBrandKnowledge(blocks: BrandBlock[]): string {
  return blocks.map((b) => `## ${b.title}\n${b.content}`).join("\n\n");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- lib/ai/brand.test.ts`
Expected: PASS.

- [ ] **Step 5: Adicionar tipos em `lib/db/types.ts`**

Append:
```ts
export type Campaign = {
  id: string;
  recipe_id: string | null;
  name: string;
  inputs: Record<string, string>;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CampaignTouch = {
  id: string;
  campaign_id: string;
  sort_order: number;
  offset_label: string;
  role: string;
  meta_category: "UTILITY" | "MARKETING";
  template_body: string;
  buttons: string[];
  window_steps: { media: string; caption: string }[];
  fallback_copy: string;
  crm_action: string;
  risk_flag: boolean;
};

export type CampaignGroupPost = {
  id: string;
  campaign_id: string;
  sort_order: number;
  offset_label: string;
  role: string;
  communities: string;
  copy: string;
  media: string;
};

export type CampaignWithContent = Campaign & {
  touches: CampaignTouch[];
  group_posts: CampaignGroupPost[];
};
```

- [ ] **Step 6: Criar a migração**

Create `supabase/migrations/0004_campaigns.sql`:
```sql
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references public.recipes(id) on delete set null,
  name text not null,
  inputs jsonb not null default '{}'::jsonb,
  status text not null default 'rascunho',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_touches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  sort_order int not null default 0,
  offset_label text not null default '',
  role text not null default '',
  meta_category text not null default 'UTILITY' check (meta_category in ('UTILITY','MARKETING')),
  template_body text not null default '',
  buttons jsonb not null default '[]'::jsonb,
  window_steps jsonb not null default '[]'::jsonb,
  fallback_copy text not null default '',
  crm_action text not null default '',
  risk_flag boolean not null default false
);

create table if not exists public.campaign_group_posts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  sort_order int not null default 0,
  offset_label text not null default '',
  role text not null default '',
  communities text not null default '',
  copy text not null default '',
  media text not null default ''
);

alter table public.campaigns enable row level security;
alter table public.campaign_touches enable row level security;
alter table public.campaign_group_posts enable row level security;

drop policy if exists "auth all campaigns" on public.campaigns;
create policy "auth all campaigns" on public.campaigns for all to authenticated using (true) with check (true);
drop policy if exists "auth all campaign_touches" on public.campaign_touches;
create policy "auth all campaign_touches" on public.campaign_touches for all to authenticated using (true) with check (true);
drop policy if exists "auth all campaign_group_posts" on public.campaign_group_posts;
create policy "auth all campaign_group_posts" on public.campaign_group_posts for all to authenticated using (true) with check (true);
```

- [ ] **Step 7: Aplicar a migração**

Carregue `select:mcp__claude_ai_Supabase__apply_migration,mcp__claude_ai_Supabase__execute_sql` (ToolSearch). Aplique com `project_id` = `gtctjfoitstbjkzpfpgk`, `name` = `campaigns`, `query` = conteúdo exato do arquivo.

- [ ] **Step 8: Verificar**

`execute_sql`:
```sql
select count(*) as campanhas from public.campaigns;
```
Expected: `campanhas = 0`. Mostre o resultado real.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: schema campaigns/touches/group_posts + compileBrandKnowledge"
```

---

### Task 2: Integração Claude — prompt, schema e geração

**Files:**
- Create: `lib/ai/prompt.ts`
- Test: `lib/ai/prompt.test.ts`
- Create: `lib/ai/schema.ts`
- Create: `lib/ai/generate.ts`

**Interfaces:**
- Consumes: `RecipeWithChildren` (`@/lib/db/types`), `compileBrandKnowledge` (`@/lib/ai/brand`).
- Produces:
  - `SYSTEM_PROMPT: string` e `buildGenerationUserPrompt(recipe, inputs, brandText): string` em `lib/ai/prompt.ts`.
  - `GENERATION_SCHEMA` (JSON schema) em `lib/ai/schema.ts`.
  - `GeneratedContent` type + `generateCampaign(recipe: RecipeWithChildren, inputs: Record<string,string>, brandText: string): Promise<GeneratedContent>` em `lib/ai/generate.ts`.

- [ ] **Step 1: Instalar o SDK**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npm install @anthropic-ai/sdk`

- [ ] **Step 2: Teste falhando de `buildGenerationUserPrompt`**

Create `lib/ai/prompt.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildGenerationUserPrompt } from "@/lib/ai/prompt";
import type { RecipeWithChildren } from "@/lib/db/types";

const recipe: RecipeWithChildren = {
  id: "r", name: "Webinário quinzenal", description: "d", recipe_type: "webinario",
  active: true, created_at: "", updated_at: "",
  inputs: [
    { id: "i1", recipe_id: "r", label: "Data e hora do webinário", field_type: "data_hora", required: true, is_anchor: true, sort_order: 0 },
  ],
  slots: [
    { id: "s1", recipe_id: "r", track: "api", offset_label: "-3 dias", role: "Convite ao webinário", meta_category: "UTILITY", target_communities: null, suggested_media: "Vídeo Lucas", sort_order: 0 },
    { id: "s2", recipe_id: "r", track: "grupos", offset_label: "-3 dias", role: "Convite", meta_category: null, target_communities: "1, 2, 3", suggested_media: "Vídeo convite", sort_order: 0 },
  ],
};

describe("buildGenerationUserPrompt", () => {
  it("inclui base, inputs preenchidos e os slots das duas trilhas", () => {
    const out = buildGenerationUserPrompt(recipe, { "Data e hora do webinário": "27/06 20h" }, "BASE_WAY");
    expect(out).toContain("BASE_WAY");
    expect(out).toContain("27/06 20h");
    expect(out).toContain("Convite ao webinário");
    expect(out).toContain("Convite"); // slot de grupo
    expect(out).toContain("UTILITY");
    expect(out).toContain("1, 2, 3"); // comunidades do slot de grupo
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npm test -- lib/ai/prompt.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 4: Implementar `lib/ai/prompt.ts`**

```ts
import type { RecipeWithChildren, RecipeSlot } from "@/lib/db/types";

export const SYSTEM_PROMPT = `Você é o Lucas Arruda, mentor da Way Group, escrevendo copy de disparos de WhatsApp na 1ª pessoa.
Regras inegociáveis:
- Português do Brasil, frases curtas, direto, SEM hype, anti-guru.
- NUNCA mencione "Wesley", preço, ou nome de tier/plano. O CTA é sempre a Sessão Estratégica gratuita.
- Trilha API individual: cada toque tem um TEMPLATE leve (pago) que termina puxando um clique de botão; a mídia persuasiva (casos, números, notícia, áudios) vai só na JANELA de 24h (grátis), nunca no template; e um FALLBACK que nunca queima o lead (reconhece e mantém a porta aberta).
- Marque risk_flag = true quando o template "UTILITY" tiver conteúdo promocional demais (risco de reclassificação da Meta).
- Trilha de Grupos: um post único (copy + mídia) para as comunidades indicadas, sem template/janela/fallback.
- Use {{1}} para o primeiro nome do lead nos templates da API.
Responda APENAS no formato estruturado pedido.`;

function describeSlots(slots: RecipeSlot[], track: "api" | "grupos"): string {
  return slots
    .filter((s) => s.track === track)
    .map((s, i) => {
      const extra = track === "api"
        ? `categoria Meta sugerida: ${s.meta_category ?? "UTILITY"}`
        : `comunidades-alvo: ${s.target_communities ?? ""}`;
      return `${i + 1}. [${s.offset_label}] ${s.role} — mídia sugerida: ${s.suggested_media} — ${extra}`;
    })
    .join("\n");
}

export function buildGenerationUserPrompt(
  recipe: RecipeWithChildren,
  inputs: Record<string, string>,
  brandText: string,
): string {
  const inputsText = recipe.inputs
    .map((i) => `- ${i.label}: ${inputs[i.label] ?? ""}`)
    .join("\n");
  return `# Base de conhecimento da marca\n${brandText}\n\n# Campanha: ${recipe.name}\n${recipe.description}\n\n# Dados desta campanha\n${inputsText}\n\n# Esqueleto — trilha API individual (gere "touches" nesta ordem)\n${describeSlots(recipe.slots, "api")}\n\n# Esqueleto — trilha Grupos (gere "group_posts" nesta ordem)\n${describeSlots(recipe.slots, "grupos")}\n\nGere a copy de cada toque e post seguindo as regras. Mantenha exatamente a quantidade e a ordem dos slots acima.`;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- lib/ai/prompt.test.ts`
Expected: PASS.

- [ ] **Step 6: Implementar o schema de saída `lib/ai/schema.ts`**

```ts
export const GENERATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["touches", "group_posts"],
  properties: {
    touches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["offset_label", "role", "meta_category", "template_body", "buttons", "window_steps", "fallback_copy", "crm_action", "risk_flag"],
        properties: {
          offset_label: { type: "string" },
          role: { type: "string" },
          meta_category: { type: "string", enum: ["UTILITY", "MARKETING"] },
          template_body: { type: "string" },
          buttons: { type: "array", items: { type: "string" } },
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
    group_posts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["offset_label", "role", "communities", "copy", "media"],
        properties: {
          offset_label: { type: "string" },
          role: { type: "string" },
          communities: { type: "string" },
          copy: { type: "string" },
          media: { type: "string" },
        },
      },
    },
  },
} as const;
```

- [ ] **Step 7: Implementar `lib/ai/generate.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { RecipeWithChildren, CampaignTouch, CampaignGroupPost } from "@/lib/db/types";
import { SYSTEM_PROMPT, buildGenerationUserPrompt } from "@/lib/ai/prompt";
import { GENERATION_SCHEMA } from "@/lib/ai/schema";

export type GeneratedContent = {
  touches: Omit<CampaignTouch, "id" | "campaign_id" | "sort_order">[];
  group_posts: Omit<CampaignGroupPost, "id" | "campaign_id" | "sort_order">[];
};

export async function generateCampaign(
  recipe: RecipeWithChildren,
  inputs: Record<string, string>,
  brandText: string,
): Promise<GeneratedContent> {
  const client = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente (servidor)
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildGenerationUserPrompt(recipe, inputs, brandText) }],
    output_config: { format: { type: "json_schema", schema: GENERATION_SCHEMA } },
    // Se a versão instalada do SDK não tipar `thinking`/`output_config`, faça o cast
    // do objeto de params (ex.: `as Anthropic.MessageCreateParamsNonStreaming`) — não remova os campos.
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("A geração não retornou conteúdo de texto.");
  }
  return JSON.parse(textBlock.text) as GeneratedContent;
}
```

- [ ] **Step 8: Validar tipos + testes**

Run: `npx tsc --noEmit && npm test`
Expected: tsc limpo (se reclamar de `output_config`/`thinking`, mantenha o cast indicado e ajuste o tipo); testes verdes.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: integração Claude (prompt + schema + generateCampaign)"
```

---

### Task 3: Acesso a dados + server actions de campanha

**Files:**
- Create: `lib/db/campaigns.ts`
- Create: `app/(app)/campanhas/actions.ts`

**Interfaces:**
- Consumes: `createServerSupabase` (`@/lib/supabase/server`), `getRecipe` (`@/lib/db/recipes`), `listBrandBlocks` (`@/lib/db/brand-knowledge`), `compileBrandKnowledge` (`@/lib/ai/brand`), `generateCampaign` (`@/lib/ai/generate`), tipos de `@/lib/db/types`.
- Produces:
  - `listCampaigns(): Promise<(Campaign & { recipe_name: string | null })[]>`, `getCampaign(id): Promise<CampaignWithContent | null>` em `lib/db/campaigns.ts`.
  - Server actions: `generateCampaignAction(recipeId: string, name: string, inputs: Record<string,string>): Promise<string>` (gera + persiste, retorna campaignId), `approveCampaignAction(id: string): Promise<void>`.

- [ ] **Step 1: Implementar o acesso a dados**

Create `lib/db/campaigns.ts`:
```ts
import { createServerSupabase } from "@/lib/supabase/server";
import type { Campaign, CampaignTouch, CampaignGroupPost, CampaignWithContent } from "@/lib/db/types";

export async function listCampaigns(): Promise<(Campaign & { recipe_name: string | null })[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("campaigns")
    .select("*, recipes(name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao carregar campanhas: ${error.message}`);
  return (data ?? []).map((c: Record<string, unknown>) => ({
    ...(c as Campaign),
    recipe_name: (c.recipes as { name: string } | null)?.name ?? null,
  }));
}

export async function getCampaign(id: string): Promise<CampaignWithContent | null> {
  const supabase = await createServerSupabase();
  const { data: campaign, error } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao carregar campanha: ${error.message}`);
  if (!campaign) return null;
  const { data: touches, error: e1 } = await supabase
    .from("campaign_touches").select("*").eq("campaign_id", id).order("sort_order");
  if (e1) throw new Error(`Falha ao carregar toques: ${e1.message}`);
  const { data: posts, error: e2 } = await supabase
    .from("campaign_group_posts").select("*").eq("campaign_id", id).order("sort_order");
  if (e2) throw new Error(`Falha ao carregar posts: ${e2.message}`);
  return {
    ...(campaign as Campaign),
    touches: (touches ?? []) as CampaignTouch[],
    group_posts: (posts ?? []) as CampaignGroupPost[],
  };
}
```

- [ ] **Step 2: Implementar as server actions**

Create `app/(app)/campanhas/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { getRecipe } from "@/lib/db/recipes";
import { listBrandBlocks } from "@/lib/db/brand-knowledge";
import { compileBrandKnowledge } from "@/lib/ai/brand";
import { generateCampaign } from "@/lib/ai/generate";

export async function generateCampaignAction(
  recipeId: string,
  name: string,
  inputs: Record<string, string>,
): Promise<string> {
  const recipe = await getRecipe(recipeId);
  if (!recipe) throw new Error("Receita não encontrada.");
  const brandText = compileBrandKnowledge(await listBrandBlocks());

  const content = await generateCampaign(recipe, inputs, brandText);

  const supabase = await createServerSupabase();
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({ recipe_id: recipeId, name: name.trim() || recipe.name, inputs })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao salvar campanha: ${error.message}`);
  const campaignId = campaign.id as string;

  if (content.touches.length > 0) {
    const { error: e1 } = await supabase.from("campaign_touches").insert(
      content.touches.map((t, idx) => ({ campaign_id: campaignId, sort_order: idx, ...t })),
    );
    if (e1) throw new Error(`Falha ao salvar toques: ${e1.message}`);
  }
  if (content.group_posts.length > 0) {
    const { error: e2 } = await supabase.from("campaign_group_posts").insert(
      content.group_posts.map((p, idx) => ({ campaign_id: campaignId, sort_order: idx, ...p })),
    );
    if (e2) throw new Error(`Falha ao salvar posts: ${e2.message}`);
  }

  revalidatePath("/campanhas");
  return campaignId;
}

export async function approveCampaignAction(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: "aprovada", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Falha ao aprovar campanha: ${error.message}`);
  revalidatePath("/campanhas");
  revalidatePath(`/campanhas/${id}`);
}
```

- [ ] **Step 3: Validar tipos + testes**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm test`
Expected: tsc limpo; testes verdes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: acesso a dados de campanhas + actions (generate/approve)"
```

---

### Task 4: Fluxo Nova campanha (escolher receita + inputs + gerar)

**Files:**
- Create: `app/(app)/campanhas/nova/page.tsx`
- Create: `app/(app)/campanhas/nova/_components/new-campaign-form.tsx` (client)

**Interfaces:**
- Consumes: `listRecipes` (`@/lib/db/recipes`)... (NÃO — precisamos das receitas COM filhos para os inputs); use `getRecipe` por receita selecionada. Para a lista inicial, `listRecipes`. Tipo `Recipe`/`RecipeWithChildren` (`@/lib/db/types`), `generateCampaignAction` (`../actions`).
- Produces: rota `/campanhas/nova` que gera e redireciona para `/campanhas/[id]`.

- [ ] **Step 1: Server Component da rota (carrega receitas com inputs)**

Create `app/(app)/campanhas/nova/page.tsx`:
```tsx
import { listRecipes, getRecipe } from "@/lib/db/recipes";
import type { RecipeWithChildren } from "@/lib/db/types";
import { NewCampaignForm } from "./_components/new-campaign-form";

export default async function NovaCampanhaPage() {
  const recipes = await listRecipes();
  const detailed = (await Promise.all(recipes.filter((r) => r.active).map((r) => getRecipe(r.id))))
    .filter((r): r is RecipeWithChildren => r !== null);
  return (
    <div className="p-8 max-w-3xl">
      <div className="font-mono text-xs uppercase tracking-widest text-muted">Passo 1 de 1</div>
      <h1 className="font-display font-bold text-3xl mt-1 mb-6">Nova campanha</h1>
      <NewCampaignForm recipes={detailed} />
    </div>
  );
}
```

- [ ] **Step 2: Form client (escolhe receita, preenche inputs, gera)**

Create `app/(app)/campanhas/nova/_components/new-campaign-form.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RecipeWithChildren } from "@/lib/db/types";
import { generateCampaignAction } from "../../actions";

export function NewCampaignForm({ recipes }: { recipes: RecipeWithChildren[] }) {
  const router = useRouter();
  const [recipeId, setRecipeId] = useState(recipes[0]?.id ?? "");
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const recipe = recipes.find((r) => r.id === recipeId);

  function generate() {
    if (!recipe) return;
    setError(null);
    startTransition(async () => {
      try {
        const id = await generateCampaignAction(recipe.id, name, values);
        router.push(`/campanhas/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao gerar campanha.");
      }
    });
  }

  if (recipes.length === 0) {
    return <p className="text-muted">Nenhuma receita ativa. Crie uma em Receitas primeiro.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {recipes.map((r) => (
          <button key={r.id} onClick={() => { setRecipeId(r.id); setValues({}); }}
            className={`text-left rounded-xl border-2 bg-white p-5 transition ${recipeId === r.id ? "border-emerald ring-2 ring-emerald/20" : "border-line hover:border-ink2"}`}>
            <div className="font-display font-bold text-lg">{r.name}</div>
            <p className="text-sm text-muted mt-1">{r.description}</p>
          </button>
        ))}
      </div>

      {recipe && (
        <div className="rounded-xl border border-line bg-white p-6 space-y-4">
          <label className="block">
            <span className="text-xs font-mono uppercase tracking-wide text-muted">Nome interno</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={recipe.name}
              className="mt-1 w-full rounded-lg border border-line p-2.5 text-sm" />
          </label>
          {recipe.inputs.map((i) => (
            <label key={i.id} className="block">
              <span className="text-xs font-mono uppercase tracking-wide text-muted">{i.label}{i.is_anchor ? " ⚓" : ""}</span>
              <input value={values[i.label] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [i.label]: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-line p-2.5 text-sm" />
            </label>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-risk">{error}</p>}
      <div className="flex justify-end gap-3">
        <button onClick={() => router.push("/campanhas")} className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium">Cancelar</button>
        <button onClick={generate} disabled={pending || !recipe}
          className="rounded-lg bg-emerald hover:bg-emeraldd transition text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-50">
          {pending ? "Gerando com a IA… (pode levar até 1 min)" : "Gerar campanha →"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Validar build**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm run build && npm test`
Expected: tsc limpo; build OK (`/campanhas/nova` presente); testes verdes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: fluxo Nova campanha (receita + inputs + gerar)"
```

---

### Task 5: Lista de campanhas + visualização (trilha de cadência)

**Files:**
- Modify: `app/(app)/campanhas/page.tsx` (lista real)
- Create: `app/(app)/campanhas/[id]/page.tsx`
- Create: `app/(app)/campanhas/[id]/_components/campaign-view.tsx` (client)

**Interfaces:**
- Consumes: `listCampaigns`/`getCampaign` (`@/lib/db/campaigns`), `approveCampaignAction` (`../actions`), tipos de `@/lib/db/types`.
- Produces: lista `/campanhas` + visualização `/campanhas/[id]`.

- [ ] **Step 1: Reescrever a lista de campanhas**

Replace `app/(app)/campanhas/page.tsx`:
```tsx
import Link from "next/link";
import { listCampaigns } from "@/lib/db/campaigns";
import { formatDateTimeBR } from "@/lib/format";

export default async function CampanhasPage() {
  const campaigns = await listCampaigns();
  return (
    <div className="p-8">
      <header className="flex items-end justify-between mb-6">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted">Visão geral</div>
          <h1 className="font-display font-bold text-3xl mt-1">Campanhas</h1>
        </div>
        <Link href="/campanhas/nova" className="rounded-lg bg-emerald hover:bg-emeraldd transition text-white text-sm font-semibold px-4 py-2.5">+ Nova campanha</Link>
      </header>

      {campaigns.length === 0 ? (
        <p className="text-muted text-sm">Nenhuma campanha ainda. Crie a primeira.</p>
      ) : (
        <div className="rounded-xl border border-line bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-paper text-muted font-mono text-xs uppercase">
              <tr>
                <th className="text-left font-medium px-4 py-3">Campanha</th>
                <th className="text-left font-medium px-4 py-3">Receita</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Criada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-paper transition">
                  <td className="px-4 py-3 font-medium"><Link href={`/campanhas/${c.id}`} className="hover:underline">{c.name}</Link></td>
                  <td className="px-4 py-3 text-muted">{c.recipe_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full text-xs font-medium px-2.5 py-1 ${c.status === "aprovada" ? "bg-emerald/15 text-emeraldd" : "bg-risk/15 text-risk"}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-muted font-mono text-xs">{formatDateTimeBR(new Date(c.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Server Component da visualização**

Create `app/(app)/campanhas/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/db/campaigns";
import { CampaignView } from "./_components/campaign-view";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  return <CampaignView campaign={campaign} />;
}
```

- [ ] **Step 3: Implementar a visualização (trilha de cadência + abas)**

Create `app/(app)/campanhas/[id]/_components/campaign-view.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignWithContent } from "@/lib/db/types";
import { approveCampaignAction } from "../../actions";

export function CampaignView({ campaign }: { campaign: CampaignWithContent }) {
  const router = useRouter();
  const [track, setTrack] = useState<"api" | "grupos">("api");
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <header className="sticky top-0 z-10 bg-paper/90 backdrop-blur border-b border-line px-8 py-4 flex items-center justify-between">
        <div>
          <button onClick={() => router.push("/campanhas")} className="font-mono text-xs text-muted hover:text-ink">← Campanhas</button>
          <h1 className="font-display font-bold text-2xl mt-0.5">{campaign.name}</h1>
          <div className="flex items-center gap-3 mt-1 font-mono text-xs text-muted">
            <span>{campaign.touches.length} toques</span><span>·</span>
            <span>{campaign.group_posts.length} posts</span><span>·</span>
            <span className={campaign.status === "aprovada" ? "text-emeraldd" : "text-risk"}>{campaign.status}</span>
          </div>
        </div>
        <button
          onClick={() => startTransition(async () => { await approveCampaignAction(campaign.id); router.refresh(); })}
          disabled={pending || campaign.status === "aprovada"}
          className="rounded-lg bg-emerald hover:bg-emeraldd transition text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {campaign.status === "aprovada" ? "Aprovada ✓" : pending ? "Aprovando…" : "Aprovar campanha"}
        </button>
      </header>

      <div className="p-8">
        <div className="flex gap-1 bg-line/40 rounded-lg p-1 w-fit mb-5">
          <button onClick={() => setTrack("api")} className={`rounded-md px-4 py-1.5 text-sm font-medium ${track === "api" ? "bg-white shadow-sm" : "text-muted"}`}>API individual <span className="font-mono text-xs text-muted">· {campaign.touches.length}</span></button>
          <button onClick={() => setTrack("grupos")} className={`rounded-md px-4 py-1.5 text-sm font-medium ${track === "grupos" ? "bg-white shadow-sm" : "text-muted"}`}>Grupos <span className="font-mono text-xs">· {campaign.group_posts.length}</span></button>
        </div>

        {track === "api" ? (
          <div className="space-y-5 max-w-3xl">
            {campaign.touches.map((t, i) => (
              <div key={t.id} className={`rounded-xl border bg-white p-5 ${t.risk_flag ? "border-risk/40" : "border-line"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><span className="font-mono text-xs text-emeraldd font-semibold">{t.offset_label}</span><span className="font-display font-bold">{t.role}</span></div>
                  <div className="flex items-center gap-2">
                    {t.risk_flag && <span className="rounded-full bg-risk/15 text-risk text-xs font-mono px-2.5 py-1">⚠ risco reclassificação</span>}
                    <span className={`rounded-full text-xs font-mono font-medium px-2.5 py-1 ${t.meta_category === "UTILITY" ? "bg-utility/12 text-utility" : "bg-marketing/12 text-marketing"}`}>{t.meta_category}</span>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="pl-3 border-l-2 border-ink2">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-ink2">Template · pago</div>
                    <p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap">{t.template_body}</p>
                    <div className="flex gap-2 mt-2 flex-wrap">{t.buttons.map((b, bi) => <span key={bi} className="rounded-full border border-line text-xs px-3 py-1">{b}</span>)}</div>
                  </div>
                  <div className="pl-3 border-l-2 border-emerald">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-emeraldd">Janela 24h · grátis</div>
                    {t.window_steps.map((w, wi) => <p key={wi} className="text-sm mt-1 leading-relaxed"><span className="font-medium">{w.media}:</span> {w.caption}</p>)}
                  </div>
                  <div className="pl-3 border-l-2 border-line">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted">Fallback</div>
                    <p className="text-sm mt-1 leading-relaxed text-ink2 whitespace-pre-wrap">{t.fallback_copy}</p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-line font-mono text-xs text-muted">CRM: {t.crm_action}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-5 max-w-3xl">
            {campaign.group_posts.map((p) => (
              <div key={p.id} className="rounded-xl border border-line bg-white p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><span className="font-mono text-xs text-emeraldd font-semibold">{p.offset_label}</span><span className="font-display font-bold">{p.role}</span></div>
                  <span className="rounded-full bg-ink/8 text-ink2 text-xs font-mono px-2.5 py-1">POST EM GRUPO</span>
                </div>
                <div className="mt-2 font-mono text-xs text-muted">Comunidades: {p.communities}</div>
                <div className="pl-3 border-l-2 border-ink2 mt-3">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-ink2">Mensagem do post</div>
                  <p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap">{p.copy}</p>
                  <p className="text-xs text-muted mt-2 font-mono">Mídia sugerida: {p.media}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Validar build + testes**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm run build && npm test`
Expected: tsc limpo; build OK (`/campanhas/[id]` presente); testes verdes.

- [ ] **Step 5: Verificação manual (com `.env.local` + ANTHROPIC_API_KEY)**

Garanta `ANTHROPIC_API_KEY=...` no `.env.local`. `npm run dev` → logar → **Campanhas → Nova campanha** → escolher "Webinário quinzenal" → preencher os inputs → **Gerar campanha** (espera ~30-60s) → ver a campanha gerada na trilha de cadência (abas API/Grupos), com copy do Lucas, sem Wesley/preço/tier, template puxando clique, mídia na janela. **Aprovar** muda o status; a lista mostra a campanha.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: lista de campanhas + visualização da campanha gerada (trilha de cadência)"
```

---

## Self-Review (preenchido)

- **Cobertura do spec (Seção 4 geração, Seção 3 campaigns/touches/group_posts, Seção 6 Nova campanha/Editor):** tabelas+RLS ✓ Task 1; integração Claude com saída estruturada + guardrails de custo no SYSTEM_PROMPT ✓ Task 2; geração persistida + aprovar ✓ Task 3; fluxo Nova campanha (receita+inputs) ✓ Task 4; lista + visualização (trilha API/Grupos, risco de reclassificação) ✓ Task 5. Edição manual, regenerar por toque e chat de refino = Plano 6 (fora deste).
- **Placeholders:** nenhum "TBD"/"TODO"; todo passo tem código/SQL/comando concreto.
- **Consistência de tipos:** `Campaign`/`CampaignTouch`/`CampaignGroupPost`/`CampaignWithContent` (Task 1) usados em Tasks 3-5; `GeneratedContent` (Task 2) consumido pela action (Task 3); `compileBrandKnowledge` (Task 1) + `buildGenerationUserPrompt`/`GENERATION_SCHEMA` (Task 2) consumidos por `generateCampaign` (Task 2) e pela action (Task 3); `generateCampaignAction`/`approveCampaignAction` com assinaturas idênticas entre Task 3 e consumidores (Tasks 4-5).
- **Nota de risco:** a geração roda numa Server Action e pode levar ~30-60s (Opus 4.8 + adaptive thinking). Em dev/uso interno tudo bem; se for pra Vercel serverless, revisar timeout de função no plano de deploy.
