# Chat de Refino + Edição por Toque — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a abordagem "C" — refinar a campanha gerada por **chat em linguagem natural** ("reescreve o toque 3 mais agressivo"), **editar manualmente** cada toque/post e **regenerar** um toque, sem perder a estrutura.

**Architecture:** Tabela `chat_messages` por campanha. O refino chama o **Claude** com a base + o estado atual da campanha + o pedido, e recebe (saída estruturada) uma resposta de chat + **atualizações por trilha/sort_order**, que são aplicadas nos `campaign_touches`/`campaign_group_posts`. A visualização vira **editor de duas colunas** (trilha de cadência editável + painel de chat). Edição manual via Server Actions; regenerar reusa o caminho de refino com uma mensagem pré-definida.

**Tech Stack:** Next.js 16 (App Router, Server Actions), `@anthropic-ai/sdk` (`claude-opus-4-8`, `output_config.format`), Supabase, Tailwind v4, Vitest.

## Global Constraints

- UI/erros em PT-BR. ANTHROPIC_API_KEY só no servidor.
- Guardrails de copy reusam o `SYSTEM_PROMPT` de `lib/ai/prompt.ts` (sem Wesley/preço/tier; template leve+clique; mídia persuasiva só na janela; fallback não queima; CTA=Sessão gratuita; {{1}}).
- Saída estruturada: JSON schema com `additionalProperties:false` e `required` em todo objeto. Se o SDK não tipar `output_config`/`thinking`, fazer cast (`as Anthropic.MessageCreateParamsNonStreaming`) — NÃO remover os campos.
- Tailwind v4 (tokens em `@theme`, incl. `brand/brand2` do redesign). Supabase project_id **`gtctjfoitstbjkzpfpgk`**; migrações via MCP `apply_migration` + arquivo em `supabase/migrations/`. Policies idempotentes.
- Org única; RLS autenticados. Node em `/tmp/node-v22.16.0-darwin-arm64/bin`. Nenhum dev server durante `npm run build`. TDD nos utilitários; commits frequentes.

---

### Task 1: chat_messages + schema de refino + prompt de refino

**Files:**
- Create: `supabase/migrations/0005_chat_messages.sql`
- Modify: `lib/db/types.ts` (adiciona `ChatMessage`)
- Create: `lib/ai/refine-schema.ts`
- Create: `lib/ai/refine-prompt.ts`
- Test: `lib/ai/refine-prompt.test.ts`

**Interfaces:**
- Consumes: `CampaignWithContent` (`@/lib/db/types`).
- Produces:
  - Tabela `public.chat_messages(id, campaign_id FK cascade, role, content, created_at)`.
  - Tipo `ChatMessage`.
  - `REFINE_SCHEMA` em `lib/ai/refine-schema.ts`.
  - `buildRefinePrompt(campaign: CampaignWithContent, userMessage: string, brandText: string): string` em `lib/ai/refine-prompt.ts`.

- [ ] **Step 1: Teste falhando de `buildRefinePrompt`**

Create `lib/ai/refine-prompt.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildRefinePrompt } from "@/lib/ai/refine-prompt";
import type { CampaignWithContent } from "@/lib/db/types";

const campaign: CampaignWithContent = {
  id: "c", recipe_id: "r", name: "Webinário 27/06", inputs: { Tema: "Amazon do zero" },
  status: "rascunho", created_at: "", updated_at: "",
  touches: [
    { id: "t1", campaign_id: "c", sort_order: 0, offset_label: "-3 dias", role: "Convite", meta_category: "UTILITY", template_body: "Oi {{1}}", buttons: ["Quero o link"], window_steps: [{ media: "Vídeo", caption: "boas-vindas" }], fallback_copy: "Tranquilo", crm_action: "tag inscrito", risk_flag: false },
  ],
  group_posts: [
    { id: "p1", campaign_id: "c", sort_order: 0, offset_label: "-3 dias", role: "Convite", communities: "1, 2, 3", copy: "Galera", media: "Vídeo convite" },
  ],
};

describe("buildRefinePrompt", () => {
  it("inclui base, estado atual (toques/posts com sort_order) e o pedido do usuário", () => {
    const out = buildRefinePrompt(campaign, "reescreve o toque 1 mais agressivo", "BASE_WAY");
    expect(out).toContain("BASE_WAY");
    expect(out).toContain("reescreve o toque 1 mais agressivo");
    expect(out).toContain("Oi {{1}}"); // estado atual do toque
    expect(out).toContain("Galera"); // estado atual do post
    expect(out).toContain("API"); // identifica a trilha
    expect(out).toMatch(/sort_order.*0/s);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npm test -- lib/ai/refine-prompt.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar `lib/ai/refine-prompt.ts`**

```ts
import type { CampaignWithContent } from "@/lib/db/types";

export function buildRefinePrompt(
  campaign: CampaignWithContent,
  userMessage: string,
  brandText: string,
): string {
  const touches = campaign.touches
    .map(
      (t) =>
        `- [API] sort_order ${t.sort_order} · ${t.offset_label} · ${t.role} · ${t.meta_category}\n  template: ${t.template_body}\n  botões: ${t.buttons.join(" | ")}\n  janela: ${t.window_steps.map((w) => `${w.media}: ${w.caption}`).join(" / ")}\n  fallback: ${t.fallback_copy}\n  crm: ${t.crm_action} · risco: ${t.risk_flag}`,
    )
    .join("\n");
  const posts = campaign.group_posts
    .map(
      (p) =>
        `- [GRUPOS] sort_order ${p.sort_order} · ${p.offset_label} · ${p.role} · comunidades ${p.communities}\n  copy: ${p.copy}\n  mídia: ${p.media}`,
    )
    .join("\n");

  return `# Base de conhecimento da marca\n${brandText}\n\n# Estado atual da campanha "${campaign.name}"\n## Trilha API individual\n${touches}\n\n## Trilha Grupos\n${posts}\n\n# Pedido do usuário\n${userMessage}\n\nAplique SÓ o que o pedido pede, respeitando as regras da marca. Retorne uma resposta curta de chat (reply) explicando o que mudou, e a lista de atualizações: para cada toque/post alterado, devolva o objeto COMPLETO atualizado com o mesmo sort_order e trilha. Não inclua toques/posts que você não alterou.`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- lib/ai/refine-prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Implementar `lib/ai/refine-schema.ts`**

```ts
export const REFINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "touch_updates", "group_post_updates"],
  properties: {
    reply: { type: "string" },
    touch_updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sort_order", "offset_label", "role", "meta_category", "template_body", "buttons", "window_steps", "fallback_copy", "crm_action", "risk_flag"],
        properties: {
          sort_order: { type: "integer" },
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
    group_post_updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sort_order", "offset_label", "role", "communities", "copy", "media"],
        properties: {
          sort_order: { type: "integer" },
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

- [ ] **Step 6: Adicionar o tipo `ChatMessage` em `lib/db/types.ts`**

Append:
```ts
export type ChatMessage = {
  id: string;
  campaign_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};
```

- [ ] **Step 7: Criar a migração**

Create `supabase/migrations/0005_chat_messages.sql`:
```sql
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null default '',
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;
drop policy if exists "auth all chat_messages" on public.chat_messages;
create policy "auth all chat_messages" on public.chat_messages for all to authenticated using (true) with check (true);
```

- [ ] **Step 8: Aplicar a migração**

Carregue `select:mcp__claude_ai_Supabase__apply_migration,mcp__claude_ai_Supabase__execute_sql`. Aplique com `project_id` = `gtctjfoitstbjkzpfpgk`, `name` = `chat_messages`, `query` = conteúdo exato do arquivo. Verifique:
```sql
select count(*) as mensagens from public.chat_messages;
```
Expected: `mensagens = 0`. Mostre o resultado real.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: chat_messages + refine schema/prompt"
```

---

### Task 2: Motor de refino + data access + server actions

**Files:**
- Create: `lib/ai/refine.ts`
- Create: `lib/db/chat.ts`
- Modify: `app/(app)/campanhas/actions.ts` (adiciona refine/update actions)

**Interfaces:**
- Consumes: `getCampaign` (`@/lib/db/campaigns`), `listBrandBlocks` (`@/lib/db/brand-knowledge`), `compileBrandKnowledge` (`@/lib/ai/brand`), `SYSTEM_PROMPT` (`@/lib/ai/prompt`), `REFINE_SCHEMA` (`@/lib/ai/refine-schema`), `buildRefinePrompt` (`@/lib/ai/refine-prompt`), `createServerSupabase` (`@/lib/supabase/server`), tipos de `@/lib/db/types`.
- Produces:
  - `RefineResult` + `refineCampaign(campaign, userMessage, brandText): Promise<RefineResult>` em `lib/ai/refine.ts`.
  - `listChatMessages(campaignId): Promise<ChatMessage[]>` em `lib/db/chat.ts`.
  - Server actions: `refineCampaignAction(campaignId: string, message: string): Promise<string>` (retorna o reply), `updateTouchAction(campaignId: string, touchId: string, fields: TouchFields): Promise<void>`, `updateGroupPostAction(campaignId: string, postId: string, fields: PostFields): Promise<void>`.

- [ ] **Step 1: Implementar `lib/ai/refine.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { CampaignWithContent } from "@/lib/db/types";
import { SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { REFINE_SCHEMA } from "@/lib/ai/refine-schema";
import { buildRefinePrompt } from "@/lib/ai/refine-prompt";

export type TouchUpdate = {
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
export type GroupPostUpdate = {
  sort_order: number;
  offset_label: string;
  role: string;
  communities: string;
  copy: string;
  media: string;
};
export type RefineResult = {
  reply: string;
  touch_updates: TouchUpdate[];
  group_post_updates: GroupPostUpdate[];
};

export async function refineCampaign(
  campaign: CampaignWithContent,
  userMessage: string,
  brandText: string,
): Promise<RefineResult> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildRefinePrompt(campaign, userMessage, brandText) }],
    output_config: { format: { type: "json_schema", schema: REFINE_SCHEMA } },
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("O refino não retornou conteúdo.");
  }
  return JSON.parse(textBlock.text) as RefineResult;
}
```

- [ ] **Step 2: Implementar `lib/db/chat.ts`**

```ts
import { createServerSupabase } from "@/lib/supabase/server";
import type { ChatMessage } from "@/lib/db/types";

export async function listChatMessages(campaignId: string): Promise<ChatMessage[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at");
  if (error) throw new Error(`Falha ao carregar conversa: ${error.message}`);
  return (data ?? []) as ChatMessage[];
}
```

- [ ] **Step 3: Adicionar as actions de refino e edição**

Append ao final de `app/(app)/campanhas/actions.ts` (mantenha os imports existentes; adicione os novos no topo):
```ts
import { getCampaign } from "@/lib/db/campaigns";
import { refineCampaign } from "@/lib/ai/refine";

export type TouchFields = {
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
export type PostFields = {
  offset_label: string;
  role: string;
  communities: string;
  copy: string;
  media: string;
};

export async function refineCampaignAction(campaignId: string, message: string): Promise<string> {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Escreva o que você quer ajustar.");
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campanha não encontrada.");
  const brandText = compileBrandKnowledge(await listBrandBlocks());

  const result = await refineCampaign(campaign, trimmed, brandText);

  const supabase = await createServerSupabase();
  await supabase.from("chat_messages").insert([
    { campaign_id: campaignId, role: "user", content: trimmed },
    { campaign_id: campaignId, role: "assistant", content: result.reply },
  ]);

  for (const u of result.touch_updates) {
    const { sort_order, ...fields } = u;
    await supabase.from("campaign_touches").update(fields).eq("campaign_id", campaignId).eq("sort_order", sort_order);
  }
  for (const u of result.group_post_updates) {
    const { sort_order, ...fields } = u;
    await supabase.from("campaign_group_posts").update(fields).eq("campaign_id", campaignId).eq("sort_order", sort_order);
  }

  revalidatePath(`/campanhas/${campaignId}`);
  return result.reply;
}

export async function updateTouchAction(campaignId: string, touchId: string, fields: TouchFields): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("campaign_touches").update(fields).eq("id", touchId);
  if (error) throw new Error(`Falha ao salvar toque: ${error.message}`);
  revalidatePath(`/campanhas/${campaignId}`);
}

export async function updateGroupPostAction(campaignId: string, postId: string, fields: PostFields): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("campaign_group_posts").update(fields).eq("id", postId);
  if (error) throw new Error(`Falha ao salvar post: ${error.message}`);
  revalidatePath(`/campanhas/${campaignId}`);
}
```

- [ ] **Step 4: Validar tipos + testes**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm test`
Expected: tsc limpo (mantenha o cast se reclamar de `output_config`/`thinking`); testes verdes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: motor de refino + actions (refine/update toque/post)"
```

---

### Task 3: Editor de duas colunas — trilha + chat de refino

**Files:**
- Modify: `app/(app)/campanhas/[id]/page.tsx` (carrega chat também)
- Modify: `app/(app)/campanhas/[id]/_components/campaign-view.tsx` (layout 2 colunas + painel de chat)
- Create: `app/(app)/campanhas/[id]/_components/refine-chat.tsx` (client)

**Interfaces:**
- Consumes: `getCampaign` (`@/lib/db/campaigns`), `listChatMessages` (`@/lib/db/chat`), `refineCampaignAction` (`../../actions`), tipos `CampaignWithContent`/`ChatMessage` (`@/lib/db/types`).
- Produces: editor com a trilha de cadência (esquerda) + painel de chat de refino (direita).

- [ ] **Step 1: Carregar o chat no Server Component**

Replace `app/(app)/campanhas/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/db/campaigns";
import { listChatMessages } from "@/lib/db/chat";
import { CampaignView } from "./_components/campaign-view";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const messages = await listChatMessages(id);
  return <CampaignView campaign={campaign} messages={messages} />;
}
```

- [ ] **Step 2: Implementar o painel de chat de refino (client)**

Create `app/(app)/campanhas/[id]/_components/refine-chat.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage } from "@/lib/db/types";
import { refineCampaignAction } from "../../actions";

export function RefineChat({ campaignId, messages }: { campaignId: string; messages: ChatMessage[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send() {
    const message = text.trim();
    if (!message) return;
    setError(null);
    setText("");
    startTransition(async () => {
      try {
        await refineCampaignAction(campaignId, message);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha no refino.");
      }
    });
  }

  return (
    <aside className="border-l border-line bg-white h-[calc(100vh-89px)] sticky top-[89px] flex flex-col">
      <div className="px-5 py-4 border-b border-line">
        <div className="font-display font-bold">Refinar</div>
        <p className="text-xs text-muted mt-0.5">Peça ajustes em linguagem natural. Eu regenero só o que muda.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
        {messages.length === 0 && (
          <p className="text-muted">Ex.: &quot;reescreve o toque 2 mais agressivo&quot;, &quot;mais urgência na promo sem hype&quot;, &quot;resolve o risco do toque 3&quot;.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex"}>
            <div className={m.role === "user"
              ? "bg-ink text-paper rounded-2xl rounded-br-sm px-3 py-2 max-w-[85%]"
              : "bg-paper border border-line rounded-2xl rounded-bl-sm px-3 py-2 max-w-[90%] whitespace-pre-wrap"}>
              {m.content}
            </div>
          </div>
        ))}
        {pending && <div className="flex"><div className="bg-paper border border-line rounded-2xl rounded-bl-sm px-3 py-2 text-muted">Refinando com a IA…</div></div>}
      </div>
      <div className="p-4 border-t border-line">
        {error && <p className="text-xs text-risk mb-2">{error}</p>}
        <div className="flex gap-2">
          <input
            value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="ex.: deixa o toque 5 com mais urgência"
            disabled={pending}
            className="flex-1 rounded-lg border border-line p-2.5 text-sm outline-none focus:border-emerald"
          />
          <button onClick={send} disabled={pending || !text.trim()}
            className="rounded-lg bg-emerald hover:bg-emeraldd transition text-white px-4 text-sm font-semibold disabled:opacity-50">Enviar</button>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Reescrever `campaign-view.tsx` para layout de 2 colunas**

Replace `app/(app)/campanhas/[id]/_components/campaign-view.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignWithContent, ChatMessage } from "@/lib/db/types";
import { approveCampaignAction } from "../../actions";
import { RefineChat } from "./refine-chat";

export function CampaignView({ campaign, messages }: { campaign: CampaignWithContent; messages: ChatMessage[] }) {
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

      <div className="grid grid-cols-[1fr_360px]">
        <div className="p-8">
          <div className="flex gap-1 bg-line/40 rounded-lg p-1 w-fit mb-5">
            <button onClick={() => setTrack("api")} className={`rounded-md px-4 py-1.5 text-sm font-medium ${track === "api" ? "bg-white shadow-sm" : "text-muted"}`}>API individual <span className="font-mono text-xs text-muted">· {campaign.touches.length}</span></button>
            <button onClick={() => setTrack("grupos")} className={`rounded-md px-4 py-1.5 text-sm font-medium ${track === "grupos" ? "bg-white shadow-sm" : "text-muted"}`}>Grupos <span className="font-mono text-xs">· {campaign.group_posts.length}</span></button>
          </div>

          {track === "api" ? (
            <div className="space-y-5 max-w-3xl">
              {campaign.touches.map((t) => (
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
                  <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
                    <span className="font-mono text-xs text-muted">CRM: {t.crm_action}</span>
                    <button
                      onClick={() => startTransition(async () => {
                        const { refineCampaignAction } = await import("../../actions");
                        await refineCampaignAction(campaign.id, `Regenere o toque da trilha API com sort_order ${t.sort_order} ("${t.role}", ${t.offset_label}), variando a copy mas mantendo o papel e a categoria. Não mexa nos outros.`);
                        router.refresh();
                      })}
                      disabled={pending}
                      className="text-xs text-emeraldd font-medium hover:underline disabled:opacity-50">Regenerar toque</button>
                  </div>
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
                  <div className="mt-4 pt-3 border-t border-line flex justify-end">
                    <button
                      onClick={() => startTransition(async () => {
                        const { refineCampaignAction } = await import("../../actions");
                        await refineCampaignAction(campaign.id, `Regenere o post da trilha Grupos com sort_order ${p.sort_order} ("${p.role}", ${p.offset_label}), variando a copy. Não mexa nos outros.`);
                        router.refresh();
                      })}
                      disabled={pending}
                      className="text-xs text-emeraldd font-medium hover:underline disabled:opacity-50">Regenerar post</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <RefineChat campaignId={campaign.id} messages={messages} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Validar build + testes**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm run build && npm test`
Expected: tsc limpo; build OK; testes verdes.

- [ ] **Step 5: Verificação manual (com ANTHROPIC_API_KEY no .env.local)**

`npm run dev` → logar → abrir uma campanha gerada → no painel **Refinar**, escrever "reescreve o toque 2 mais agressivo, sem hype" → enviar → ver a mensagem do assistente e o toque 2 atualizado na trilha. Testar **Regenerar toque** num card. O histórico do chat persiste no refresh.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: editor de campanha com chat de refino + regenerar por toque"
```

---

### Task 4: Edição manual por toque/post

**Files:**
- Create: `app/(app)/campanhas/[id]/_components/touch-card.tsx` (client, extrai o card editável)
- Create: `app/(app)/campanhas/[id]/_components/post-card.tsx` (client)
- Modify: `app/(app)/campanhas/[id]/_components/campaign-view.tsx` (usa os cards)

**Interfaces:**
- Consumes: `updateTouchAction`/`updateGroupPostAction` e tipos `TouchFields`/`PostFields` (`../../actions`), tipos `CampaignTouch`/`CampaignGroupPost` (`@/lib/db/types`).
- Produces: cards com botão **Editar** (campos viram inputs) → **Salvar** (persiste).

- [ ] **Step 1: Implementar `touch-card.tsx`**

Create `app/(app)/campanhas/[id]/_components/touch-card.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignTouch } from "@/lib/db/types";
import { updateTouchAction, type TouchFields } from "../../actions";

export function TouchCard({ campaignId, touch }: { campaignId: string; touch: CampaignTouch }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState<TouchFields>({
    offset_label: touch.offset_label, role: touch.role, meta_category: touch.meta_category,
    template_body: touch.template_body, buttons: touch.buttons, window_steps: touch.window_steps,
    fallback_copy: touch.fallback_copy, crm_action: touch.crm_action, risk_flag: touch.risk_flag,
  });

  function save() {
    startTransition(async () => {
      await updateTouchAction(campaignId, touch.id, f);
      setEditing(false);
      router.refresh();
    });
  }

  function regenerate() {
    startTransition(async () => {
      const { refineCampaignAction } = await import("../../actions");
      await refineCampaignAction(campaignId, `Regenere o toque da trilha API com sort_order ${touch.sort_order} ("${touch.role}", ${touch.offset_label}), variando a copy mas mantendo o papel e a categoria. Não mexa nos outros.`);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className={`rounded-xl border bg-white p-5 ${touch.risk_flag ? "border-risk/40" : "border-line"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="font-mono text-xs text-emeraldd font-semibold">{touch.offset_label}</span><span className="font-display font-bold">{touch.role}</span></div>
          <div className="flex items-center gap-2">
            {touch.risk_flag && <span className="rounded-full bg-risk/15 text-risk text-xs font-mono px-2.5 py-1">⚠ risco reclassificação</span>}
            <span className={`rounded-full text-xs font-mono font-medium px-2.5 py-1 ${touch.meta_category === "UTILITY" ? "bg-utility/12 text-utility" : "bg-marketing/12 text-marketing"}`}>{touch.meta_category}</span>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div className="pl-3 border-l-2 border-ink2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink2">Template · pago</div>
            <p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap">{touch.template_body}</p>
            <div className="flex gap-2 mt-2 flex-wrap">{touch.buttons.map((b, bi) => <span key={bi} className="rounded-full border border-line text-xs px-3 py-1">{b}</span>)}</div>
          </div>
          <div className="pl-3 border-l-2 border-emerald">
            <div className="font-mono text-[10px] uppercase tracking-widest text-emeraldd">Janela 24h · grátis</div>
            {touch.window_steps.map((w, wi) => <p key={wi} className="text-sm mt-1 leading-relaxed"><span className="font-medium">{w.media}:</span> {w.caption}</p>)}
          </div>
          <div className="pl-3 border-l-2 border-line">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted">Fallback</div>
            <p className="text-sm mt-1 leading-relaxed text-ink2 whitespace-pre-wrap">{touch.fallback_copy}</p>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
          <span className="font-mono text-xs text-muted">CRM: {touch.crm_action}</span>
          <div className="flex gap-3">
            <button onClick={() => setEditing(true)} className="text-xs text-ink2 font-medium hover:underline">Editar</button>
            <button onClick={regenerate} disabled={pending} className="text-xs text-emeraldd font-medium hover:underline disabled:opacity-50">Regenerar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald/40 bg-white p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Offset</span><input value={f.offset_label} onChange={(e) => setF({ ...f, offset_label: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
        <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Categoria Meta</span>
          <select value={f.meta_category} onChange={(e) => setF({ ...f, meta_category: e.target.value as "UTILITY" | "MARKETING" })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm">
            <option value="UTILITY">UTILITY</option><option value="MARKETING">MARKETING</option>
          </select></label>
      </div>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Papel</span><input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Template</span><textarea value={f.template_body} onChange={(e) => setF({ ...f, template_body: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Botões (separados por vírgula)</span><input value={f.buttons.join(", ")} onChange={(e) => setF({ ...f, buttons: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Fallback</span><textarea value={f.fallback_copy} onChange={(e) => setF({ ...f, fallback_copy: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Ação de CRM</span><input value={f.crm_action} onChange={(e) => setF({ ...f, crm_action: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={f.risk_flag} onChange={(e) => setF({ ...f, risk_flag: e.target.checked })} className="accent-emerald" /> marcar risco de reclassificação</label>
      <p className="text-[11px] text-muted font-mono">A janela de 24h (mídias) é ajustada pelo chat de refino.</p>
      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={pending} className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50">{pending ? "Salvando…" : "Salvar"}</button>
        <button onClick={() => setEditing(false)} className="rounded-lg border border-line text-sm px-3 py-1.5">Cancelar</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implementar `post-card.tsx`**

Create `app/(app)/campanhas/[id]/_components/post-card.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignGroupPost } from "@/lib/db/types";
import { updateGroupPostAction, type PostFields } from "../../actions";

export function PostCard({ campaignId, post }: { campaignId: string; post: CampaignGroupPost }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState<PostFields>({
    offset_label: post.offset_label, role: post.role, communities: post.communities, copy: post.copy, media: post.media,
  });

  function save() {
    startTransition(async () => {
      await updateGroupPostAction(campaignId, post.id, f);
      setEditing(false);
      router.refresh();
    });
  }

  function regenerate() {
    startTransition(async () => {
      const { refineCampaignAction } = await import("../../actions");
      await refineCampaignAction(campaignId, `Regenere o post da trilha Grupos com sort_order ${post.sort_order} ("${post.role}", ${post.offset_label}), variando a copy. Não mexa nos outros.`);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="font-mono text-xs text-emeraldd font-semibold">{post.offset_label}</span><span className="font-display font-bold">{post.role}</span></div>
          <span className="rounded-full bg-ink/8 text-ink2 text-xs font-mono px-2.5 py-1">POST EM GRUPO</span>
        </div>
        <div className="mt-2 font-mono text-xs text-muted">Comunidades: {post.communities}</div>
        <div className="pl-3 border-l-2 border-ink2 mt-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink2">Mensagem do post</div>
          <p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap">{post.copy}</p>
          <p className="text-xs text-muted mt-2 font-mono">Mídia sugerida: {post.media}</p>
        </div>
        <div className="mt-4 pt-3 border-t border-line flex justify-end gap-3">
          <button onClick={() => setEditing(true)} className="text-xs text-ink2 font-medium hover:underline">Editar</button>
          <button onClick={regenerate} disabled={pending} className="text-xs text-emeraldd font-medium hover:underline disabled:opacity-50">Regenerar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald/40 bg-white p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Offset</span><input value={f.offset_label} onChange={(e) => setF({ ...f, offset_label: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
        <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Comunidades</span><input value={f.communities} onChange={(e) => setF({ ...f, communities: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      </div>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Papel</span><input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Mensagem do post</span><textarea value={f.copy} onChange={(e) => setF({ ...f, copy: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Mídia sugerida</span><input value={f.media} onChange={(e) => setF({ ...f, media: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={pending} className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50">{pending ? "Salvando…" : "Salvar"}</button>
        <button onClick={() => setEditing(false)} className="rounded-lg border border-line text-sm px-3 py-1.5">Cancelar</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Usar os cards na `campaign-view.tsx`**

Em `app/(app)/campanhas/[id]/_components/campaign-view.tsx`, adicione os imports no topo:
```tsx
import { TouchCard } from "./touch-card";
import { PostCard } from "./post-card";
```
Substitua o bloco de renderização da trilha API (o `.map` dos toques inteiro) por:
```tsx
            <div className="space-y-5 max-w-3xl">
              {campaign.touches.map((t) => (
                <TouchCard key={t.id} campaignId={campaign.id} touch={t} />
              ))}
            </div>
```
E o bloco da trilha Grupos (o `.map` dos posts inteiro) por:
```tsx
            <div className="space-y-5 max-w-3xl">
              {campaign.group_posts.map((p) => (
                <PostCard key={p.id} campaignId={campaign.id} post={p} />
              ))}
            </div>
```
Remova os imports/usos que ficaram órfãos (o `import(...)` de `refineCampaignAction` que estava inline nos cards antigos foi para dentro de `TouchCard`/`PostCard`).

- [ ] **Step 4: Validar build + testes**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm run build && npm test`
Expected: tsc limpo; build OK; testes verdes.

- [ ] **Step 5: Verificação manual**

`npm run dev` → abrir campanha → **Editar** um toque (mudar o template, salvar → persiste) → **Regenerar** um toque → usar o **chat de refino**. Tudo no novo visual.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: edição manual por toque/post no editor de campanha"
```

---

## Self-Review (preenchido)

- **Cobertura do spec (Seção 4.2 chat de refino; Seção 6 editor):** chat_messages + refino por linguagem natural ✓ Tasks 1-3; editar/regenerar por toque ✓ Tasks 3-4. Fecha a abordagem "C".
- **Placeholders:** nenhum "TBD"/"TODO"; todo passo tem código/SQL/comando concreto.
- **Consistência de tipos:** `ChatMessage` (Task 1) usado em Tasks 2-3; `REFINE_SCHEMA`/`buildRefinePrompt` (Task 1) consumidos por `refineCampaign` (Task 2); `RefineResult`/`TouchFields`/`PostFields` (Task 2) consumidos pelas actions e cards (Tasks 3-4); `refineCampaignAction`/`updateTouchAction`/`updateGroupPostAction` com assinaturas idênticas entre Task 2 e consumidores. O refino aplica updates por `(campaign_id, sort_order)`, coerente com o insert do Plano 5 (sort_order = índice).
- **Nota:** o refino e o regenerar chamam o Claude numa Server Action (~30-60s) — mesma dívida do Plano 5 (timeout serverless no deploy).
