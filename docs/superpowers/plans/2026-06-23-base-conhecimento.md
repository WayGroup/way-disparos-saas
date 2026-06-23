# Base de Conhecimento + Design Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao app a cara do mockup (tokens/fontes/sidebar) e entregar a tela **Base de conhecimento** (blocos editáveis do Way) + gestão de **comunidades**, com dados reais no Supabase.

**Architecture:** Tailwind v4 (tokens via `@theme` no `globals.css`) + fontes `next/font` (Archivo/Inter/IBM Plex Mono). Shell vira layout com **sidebar escura** (Server Component + um `Sidebar` client para estado ativo). Dados em duas tabelas Supabase (`brand_knowledge`, `communities`) com RLS para autenticados; leitura via Server Components e escrita via **Server Actions**.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Tailwind v4, `@supabase/ssr`, Supabase Postgres, Vitest.

## Global Constraints

- UI/erros em PT-BR.
- Tailwind é **v4**: tokens de tema vão em `@theme` dentro de `app/globals.css` (NÃO existe `tailwind.config.js`). Cores viram utilitários (`bg-ink`, `text-emerald`, etc.) e aceitam opacidade (`bg-emerald/12`).
- Tokens do mockup (verbatim): `ink #15211C`, `ink2 #2A3B34`, `paper #FBFAF7`, `line #E5E2D9`, `emerald #1F7A5A`, `emeraldd #185F46`, `utility #2D6CDF`, `marketing #C8701C`, `risk #B8860B`, `muted #6B7269`. Fontes: Archivo (display), Inter (body), IBM Plex Mono (mono).
- Supabase: project_id **`gtctjfoitstbjkzpfpgk`** (org My Way). Migrações aplicadas via a tool MCP `mcp__claude_ai_Supabase__apply_migration` (use ToolSearch para carregá-la) E salvas como arquivo em `supabase/migrations/`.
- Org única: RLS libera tudo para qualquer usuário autenticado.
- Node fica em `/tmp/node-v22.16.0-darwin-arm64/bin` — exporte no PATH antes de `npm`.
- TDD nos utilitários puros; telas validadas por `npm run build`. Commits frequentes.

---

### Task 1: Design foundation + shell com sidebar

**Files:**
- Modify: `app/globals.css` (tokens `@theme`, remove dark-mode, body em paper)
- Modify: `app/layout.tsx` (fontes Archivo/Inter/IBM Plex Mono)
- Create: `lib/nav.ts`
- Test: `lib/nav.test.ts`
- Create: `app/(app)/_components/sidebar.tsx` (client)
- Modify: `app/(app)/layout.tsx` (usa o Sidebar, grid com sidebar)
- Create: `app/(app)/midias/page.tsx` (placeholder, pra nav não dar 404)

**Interfaces:**
- Consumes: `createServerSupabase` (`@/lib/supabase/server`).
- Produces:
  - `NAV_ITEMS: { href: string; label: string }[]` e `isActiveNav(pathname: string, href: string): boolean` em `lib/nav.ts`.

- [ ] **Step 1: Escrever o teste falhando de `isActiveNav`**

Create `lib/nav.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { NAV_ITEMS, isActiveNav } from "@/lib/nav";

describe("nav", () => {
  it("expõe os itens de navegação na ordem do mockup", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual([
      "/campanhas",
      "/receitas",
      "/midias",
      "/base-conhecimento",
    ]);
  });

  it("marca ativo no match exato", () => {
    expect(isActiveNav("/campanhas", "/campanhas")).toBe(true);
  });

  it("marca ativo em subrota", () => {
    expect(isActiveNav("/base-conhecimento/algum", "/base-conhecimento")).toBe(true);
  });

  it("não marca ativo em rota diferente", () => {
    expect(isActiveNav("/receitas", "/campanhas")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npm test -- lib/nav.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar `lib/nav.ts`**

```ts
export const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/campanhas", label: "Campanhas" },
  { href: "/receitas", label: "Receitas" },
  { href: "/midias", label: "Mídias" },
  { href: "/base-conhecimento", label: "Base de conhecimento" },
];

export function isActiveNav(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- lib/nav.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Reescrever `app/globals.css` com os tokens do mockup**

```css
@import "tailwindcss";

@theme {
  --color-ink: #15211c;
  --color-ink2: #2a3b34;
  --color-paper: #fbfaf7;
  --color-line: #e5e2d9;
  --color-emerald: #1f7a5a;
  --color-emeraldd: #185f46;
  --color-utility: #2d6cdf;
  --color-marketing: #c8701c;
  --color-risk: #b8860b;
  --color-muted: #6b7269;

  --font-display: var(--font-archivo), system-ui, sans-serif;
  --font-sans: var(--font-inter), system-ui, sans-serif;
  --font-mono: var(--font-plex-mono), monospace;
}

body {
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-sans);
}
```

- [ ] **Step 6: Atualizar as fontes em `app/layout.tsx`**

Replace o conteúdo por:
```tsx
import type { Metadata } from "next";
import { Archivo, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], weight: ["500", "600", "700", "800"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Disparos Way",
  description: "Geração interna de campanhas de disparo — Way Group",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${archivo.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Criar o `Sidebar` client component**

Create `app/(app)/_components/sidebar.tsx`:
```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActiveNav } from "@/lib/nav";

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <aside className="bg-ink text-paper flex flex-col p-4 sticky top-0 h-screen">
      <div className="px-2 py-3">
        <div className="font-display font-extrabold text-xl leading-none">Disparos Way</div>
        <div className="font-mono text-[10px] tracking-widest text-emerald uppercase mt-1">uso interno</div>
      </div>
      <nav className="mt-6 space-y-1 text-sm">
        {NAV_ITEMS.map((item) => {
          const active = isActiveNav(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 transition hover:bg-white/10 ${active ? "bg-paper text-ink" : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-white/10 pt-4 px-2">
        <div className="text-sm font-medium truncate">{email}</div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="mt-3 text-xs text-paper/60 underline hover:text-paper">Sair</button>
        </form>
      </div>
    </aside>
  );
}
```

- [ ] **Step 8: Reescrever `app/(app)/layout.tsx` para o shell com sidebar**

```tsx
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { Sidebar } from "./_components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="grid grid-cols-[230px_1fr] min-h-screen">
      <Sidebar email={user.email ?? "—"} />
      <div className="overflow-y-auto h-screen">{children}</div>
    </div>
  );
}
```

- [ ] **Step 9: Criar placeholder de Mídias (evita 404 no nav)**

Create `app/(app)/midias/page.tsx`:
```tsx
export default function MidiasPage() {
  return (
    <div className="p-8">
      <h1 className="font-display font-bold text-3xl">Mídias</h1>
      <p className="text-muted mt-2">Biblioteca de mídias — em breve.</p>
    </div>
  );
}
```

- [ ] **Step 10: Validar build + testes**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: tsc limpo; build OK; testes verdes (nav incluído).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: design foundation (tokens/fontes do mockup) + shell com sidebar"
```

---

### Task 2: Schema Supabase — brand_knowledge + communities (migração + seed)

**Files:**
- Create: `supabase/migrations/0001_brand_knowledge_communities.sql`
- Create: `lib/db/types.ts`
- Create: `lib/text.ts`
- Test: `lib/text.test.ts`

**Interfaces:**
- Consumes: nada de código anterior.
- Produces:
  - Tabelas `public.brand_knowledge(id uuid, block_key text unique, title text, content text, sort_order int, updated_at timestamptz)` e `public.communities(id uuid, name text, identifier text unique, sort_order int, created_at timestamptz)`.
  - Tipos `BrandBlock` e `Community` em `lib/db/types.ts`.
  - `slugifyIdentifier(name: string): string` em `lib/text.ts`.

- [ ] **Step 1: Escrever o teste falhando de `slugifyIdentifier`**

Create `lib/text.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { slugifyIdentifier } from "@/lib/text";

describe("slugifyIdentifier", () => {
  it("normaliza acentos, espaços e caixa", () => {
    expect(slugifyIdentifier("Comunidade Nº 1 — Quentes")).toBe("comunidade-no-1-quentes");
  });
  it("colapsa separadores repetidos", () => {
    expect(slugifyIdentifier("  A   B  ")).toBe("a-b");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npm test -- lib/text.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar `lib/text.ts`**

```ts
export function slugifyIdentifier(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- lib/text.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Criar o arquivo de migração**

Create `supabase/migrations/0001_brand_knowledge_communities.sql`:
```sql
-- brand_knowledge: blocos tipados editáveis da marca Way
create table if not exists public.brand_knowledge (
  id uuid primary key default gen_random_uuid(),
  block_key text not null unique,
  title text not null,
  content text not null default '',
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  identifier text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.brand_knowledge enable row level security;
alter table public.communities enable row level security;

create policy "auth read brand" on public.brand_knowledge for select to authenticated using (true);
create policy "auth write brand" on public.brand_knowledge for update to authenticated using (true) with check (true);
create policy "auth all communities" on public.communities for all to authenticated using (true) with check (true);

-- seed brand_knowledge (Way)
insert into public.brand_knowledge (block_key, title, content, sort_order) values
  ('marca_missao', 'Marca & missão', 'Way Group (BH/MG). Ajudar pessoas comuns a vender na Amazon Brasil com transparência. Pilar: "vender a verdade". Anti-guru, sem hype. Time jovem, pegada leve de fé.', 1),
  ('mentor', 'Mentor — Lucas Arruda', 'Embaixador da Amazon no Brasil. +R$45–55 milhões gerados para mentorados. Destaque no programa Pequenas Empresas & Grandes Negócios (Globo). 8 anos de experiência. Toda copy em 1ª pessoa do Lucas.', 2),
  ('numeros', 'Números oficiais', '+R$55 milhões gerados na Amazon · +500 mentorados em 2 anos · +10.000 alunos em cursos gravados · nota de satisfação 9,58 · Amazon investiu +R$75 bilhões no Brasil · menos de 1% dos vendedores fatura +R$100 mil/mês.', 3),
  ('oferta', 'Oferta / funil', 'Destino: Sessão Estratégica gratuita (call de diagnóstico). NÃO citar preço nem tier nos disparos. CTA sempre = a sessão gratuita. Garantia citada de forma geral (resultado em 6 meses ou dinheiro de volta), sem cravar número de tier.', 4),
  ('personas', 'Personas', 'CLT insatisfeito · Empreendedor frustrado · Investidor conservador · Profissional liberal. Alvo nobre: lead com R$10k+ de capital.', 5),
  ('provas_sociais', 'Provas sociais', 'Gustavo David (R$23k→R$230k em 40 dias) · Fabrício Mafra (R$1mi em 8 meses) · Sérgio Filho (R$500k em 5 meses) · Willer Pierazoli (R$500k em 6 meses) · Guilherme e Cecília (R$284k em 100 dias) · Raphael Rodrigo (R$350k em 6 meses) · Daniel Rangel (R$280k em 100 dias). Todos com vídeo.', 6),
  ('noticias', 'Notícias / autoridade', 'Amazon investiu +R$75 bilhões no Brasil e elegeu o país como prioridade global de expansão até 2030. ~200 mil vendedores na Amazon Brasil; menos de 1% fatura +R$100k/mês. Diferença do 1% = direção certa + timing.', 7),
  ('diretrizes_escrita', 'Diretrizes de escrita', '1ª pessoa do Lucas, WhatsApp, frases curtas, direto, sem hype, anti-guru. Toda copy de disparo termina puxando uma resposta de uma palavra/botão (VÍDEO, SIM, EU QUERO, VAMOS). Mídia persuasiva só na janela grátis; template leve.', 8),
  ('restricoes', 'Restrições (travas)', 'SEM Wesley — remover 100% das menções. SEM preço e SEM tier nos disparos. CTA sempre = Sessão Estratégica gratuita. Garantia de forma geral, sem cravar número. Fallback nunca queima o lead.', 9),
  ('modelo_custo', 'Regras do modelo de custo', 'Template leve termina em clique de botão. Mídia persuasiva (casos, números, notícia, áudios) só na janela de 24h (grátis), nunca no template. Cada toque carrega categoria Meta sugerida (UTILITY/MARKETING). Sinalizar risco de reclassificação quando template utility tem conteúdo promocional.', 10)
on conflict (block_key) do nothing;

-- seed communities (genéricas)
insert into public.communities (name, identifier, sort_order) values
  ('Comunidade 1', 'comunidade-1', 1),
  ('Comunidade 2', 'comunidade-2', 2),
  ('Comunidade 3', 'comunidade-3', 3)
on conflict (identifier) do nothing;
```

- [ ] **Step 6: Aplicar a migração no Supabase**

Carregue a tool com ToolSearch (`select:mcp__claude_ai_Supabase__apply_migration`) e aplique:
- `project_id`: `gtctjfoitstbjkzpfpgk`
- `name`: `brand_knowledge_communities`
- `query`: o conteúdo exato do arquivo `supabase/migrations/0001_brand_knowledge_communities.sql`.

- [ ] **Step 7: Verificar os dados aplicados**

Carregue `select:mcp__claude_ai_Supabase__execute_sql` e rode:
```sql
select (select count(*) from public.brand_knowledge) as blocos,
       (select count(*) from public.communities) as comunidades;
```
Expected: `blocos = 10`, `comunidades = 3`. Mostre o resultado real.

- [ ] **Step 8: Criar os tipos TypeScript**

Create `lib/db/types.ts`:
```ts
export type BrandBlock = {
  id: string;
  block_key: string;
  title: string;
  content: string;
  sort_order: number;
  updated_at: string;
};

export type Community = {
  id: string;
  name: string;
  identifier: string;
  sort_order: number;
  created_at: string;
};
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: schema brand_knowledge + communities (migração, RLS, seed Way) + slugify"
```

---

### Task 3: Tela Base de conhecimento + gestão de comunidades

**Files:**
- Create: `lib/db/brand-knowledge.ts`
- Create: `lib/db/communities.ts`
- Create: `app/(app)/base-conhecimento/actions.ts`
- Modify: `app/(app)/base-conhecimento/page.tsx`
- Create: `app/(app)/base-conhecimento/_components/block-card.tsx` (client)
- Create: `app/(app)/base-conhecimento/_components/communities-manager.tsx` (client)

**Interfaces:**
- Consumes: `createServerSupabase` (`@/lib/supabase/server`), `BrandBlock`/`Community` (`@/lib/db/types`), `slugifyIdentifier` (`@/lib/text`).
- Produces:
  - `listBrandBlocks(): Promise<BrandBlock[]>`, `listCommunities(): Promise<Community[]>` (data access).
  - Server actions `updateBlockAction(blockKey: string, content: string): Promise<void>`, `addCommunityAction(name: string): Promise<void>`, `removeCommunityAction(id: string): Promise<void>`.

- [ ] **Step 1: Implementar o acesso a dados de brand_knowledge**

Create `lib/db/brand-knowledge.ts`:
```ts
import { createServerSupabase } from "@/lib/supabase/server";
import type { BrandBlock } from "@/lib/db/types";

export async function listBrandBlocks(): Promise<BrandBlock[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("brand_knowledge")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(`Falha ao carregar base de conhecimento: ${error.message}`);
  return (data ?? []) as BrandBlock[];
}
```

- [ ] **Step 2: Implementar o acesso a dados de communities**

Create `lib/db/communities.ts`:
```ts
import { createServerSupabase } from "@/lib/supabase/server";
import type { Community } from "@/lib/db/types";

export async function listCommunities(): Promise<Community[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(`Falha ao carregar comunidades: ${error.message}`);
  return (data ?? []) as Community[];
}
```

- [ ] **Step 3: Implementar as server actions**

Create `app/(app)/base-conhecimento/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { slugifyIdentifier } from "@/lib/text";

export async function updateBlockAction(blockKey: string, content: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("brand_knowledge")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("block_key", blockKey);
  if (error) throw new Error(`Falha ao salvar bloco: ${error.message}`);
  revalidatePath("/base-conhecimento");
}

export async function addCommunityAction(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Nome da comunidade é obrigatório.");
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("communities")
    .insert({ name: trimmed, identifier: slugifyIdentifier(trimmed), sort_order: 99 });
  if (error) throw new Error(`Falha ao adicionar comunidade: ${error.message}`);
  revalidatePath("/base-conhecimento");
}

export async function removeCommunityAction(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("communities").delete().eq("id", id);
  if (error) throw new Error(`Falha ao remover comunidade: ${error.message}`);
  revalidatePath("/base-conhecimento");
}
```

- [ ] **Step 4: Implementar o card de bloco editável (client)**

Create `app/(app)/base-conhecimento/_components/block-card.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import type { BrandBlock } from "@/lib/db/types";
import { updateBlockAction } from "../actions";

const RESTRICTION_KEYS = ["restricoes"];

export function BlockCard({ block }: { block: BrandBlock }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(block.content);
  const [pending, startTransition] = useTransition();
  const isRestriction = RESTRICTION_KEYS.includes(block.block_key);

  function save() {
    startTransition(async () => {
      await updateBlockAction(block.block_key, value);
      setEditing(false);
    });
  }

  return (
    <div className={`rounded-xl border bg-white p-5 ${isRestriction ? "border-risk/40 bg-risk/5" : "border-line"}`}>
      <div className="flex items-center justify-between">
        <h2 className={`font-display font-bold ${isRestriction ? "text-risk" : ""}`}>{block.title}</h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-emeraldd hover:underline">Editar</button>
        )}
      </div>
      {editing ? (
        <div className="mt-2">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-line p-2 text-sm"
          />
          <div className="flex gap-2 mt-2">
            <button onClick={save} disabled={pending} className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50">
              {pending ? "Salvando..." : "Salvar"}
            </button>
            <button onClick={() => { setValue(block.content); setEditing(false); }} className="rounded-lg border border-line text-sm px-3 py-1.5">Cancelar</button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink2 mt-2 leading-relaxed whitespace-pre-wrap">{block.content}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implementar o gerenciador de comunidades (client)**

Create `app/(app)/base-conhecimento/_components/communities-manager.tsx`:
```tsx
"use client";
import { useState, useTransition } from "react";
import type { Community } from "@/lib/db/types";
import { addCommunityAction, removeCommunityAction } from "../actions";

export function CommunitiesManager({ communities }: { communities: Community[] }) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <h2 className="font-display font-bold">Comunidades do funil</h2>
      <p className="text-sm text-muted mt-1">Usadas como alvo dos posts em grupo.</p>
      <ul className="mt-3 space-y-2">
        {communities.map((c) => (
          <li key={c.id} className="flex items-center justify-between text-sm">
            <span>{c.name} <span className="font-mono text-xs text-muted">· {c.identifier}</span></span>
            <button
              onClick={() => startTransition(async () => { await removeCommunityAction(c.id); })}
              disabled={pending}
              className="text-xs text-muted hover:text-risk"
            >remover</button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 mt-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nova comunidade"
          className="flex-1 rounded-lg border border-line p-2 text-sm"
        />
        <button
          onClick={() => startTransition(async () => { await addCommunityAction(name); setName(""); })}
          disabled={pending || !name.trim()}
          className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50"
        >Adicionar</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Reescrever a página Base de conhecimento (Server Component)**

Replace `app/(app)/base-conhecimento/page.tsx`:
```tsx
import { listBrandBlocks } from "@/lib/db/brand-knowledge";
import { listCommunities } from "@/lib/db/communities";
import { BlockCard } from "./_components/block-card";
import { CommunitiesManager } from "./_components/communities-manager";

export default async function BaseConhecimentoPage() {
  const [blocks, communities] = await Promise.all([listBrandBlocks(), listCommunities()]);

  return (
    <div className="p-8 max-w-5xl">
      <div className="font-mono text-xs uppercase tracking-widest text-muted">Contexto da marca · usado em toda geração</div>
      <h1 className="font-display font-bold text-3xl mt-1 mb-6">Base de conhecimento — Way</h1>

      <div className="grid grid-cols-2 gap-4">
        {blocks.map((block) => (
          <BlockCard key={block.id} block={block} />
        ))}
      </div>

      <div className="mt-8">
        <CommunitiesManager communities={communities} />
      </div>

      <p className="text-xs text-muted mt-4 font-mono">Toda alteração aqui passa a valer nas próximas gerações.</p>
    </div>
  );
}
```

- [ ] **Step 7: Validar build + tipos + testes**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm run build && npm test`
Expected: tsc limpo; build OK; testes verdes.

- [ ] **Step 8: Verificação manual (com dev server e usuário logado)**

`npm run dev` → logar → ir em **Base de conhecimento**: ver 10 blocos com o conteúdo do Way (bloco "Restrições" destacado), editar um bloco e salvar (persiste após refresh), adicionar/remover uma comunidade.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: tela base de conhecimento (blocos editáveis) + gestão de comunidades"
```

---

## Self-Review (preenchido)

- **Cobertura do spec:** design tokens/sidebar (Seções 2/6) ✓ Task 1; tabela `brand_knowledge` em blocos tipados editáveis (Seção 3) ✓ Tasks 2-3; `communities` editáveis (Seção 3) ✓ Tasks 2-3; restrições "sem Wesley/sem preço/sem tier" no seed ✓ Task 2. Assets/Mídias e demais telas ficam para planos seguintes (fora deste).
- **Placeholders:** nenhum "TBD"/"TODO"; todo passo tem código/SQL/comando concreto.
- **Consistência de tipos:** `BrandBlock`/`Community` definidos na Task 2 e usados na Task 3 com os mesmos campos; `slugifyIdentifier` (Task 2) consumido pela action (Task 3); `NAV_ITEMS`/`isActiveNav` (Task 1) consumidos pelo Sidebar.
