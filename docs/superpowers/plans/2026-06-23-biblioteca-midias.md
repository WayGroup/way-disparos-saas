# Biblioteca de Mídias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a tela **Mídias** — biblioteca global de assets (vídeo/imagem/áudio/PDF) com upload no Supabase Storage, grid com filtros, baixar e copiar link público.

**Architecture:** Bucket **público** `assets` no Supabase Storage + tabela `public.assets` (metadados). Upload acontece no **browser** (supabase-js storage, evita o limite de body do Next), depois uma Server Action registra a linha. Listagem por Server Component; filtro/busca/ordenação no client em cima da lista carregada.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Tailwind v4, `@supabase/ssr` (browser + server), Supabase Storage + Postgres, Vitest.

## Global Constraints

- UI/erros em PT-BR.
- Tailwind **v4**: tokens já existem em `app/globals.css` `@theme` (`ink/paper/line/emerald/emeraldd/utility/marketing/risk/muted`, fontes `display/sans/mono`). Reusar; não redefinir.
- Supabase: project_id **`gtctjfoitstbjkzpfpgk`**. Migrações via tool MCP `mcp__claude_ai_Supabase__apply_migration` (ToolSearch para carregar) E salvas em `supabase/migrations/`.
- Bucket `assets` é **público** (leitura por URL pública); upload/delete só para autenticados.
- Org única: RLS/policies liberam autenticados.
- Node em `/tmp/node-v22.16.0-darwin-arm64/bin` — exporte no PATH. Nenhum dev server rodando durante `npm run build`.
- TDD nos utilitários puros; telas validadas por `npm run build`. Commits frequentes.
- Tipos de mídia aceitos: `video` (mp4), `image` (png/jpg), `audio` (mp3), `pdf`. Limite sugerido 200MB/arquivo (apenas texto na UI; não impor no servidor neste plano).

---

### Task 1: Schema de assets + bucket Storage + utilitários

**Files:**
- Create: `supabase/migrations/0002_assets.sql`
- Create: `lib/assets/kind.ts`
- Test: `lib/assets/kind.test.ts`
- Modify: `lib/db/types.ts` (adiciona o tipo `Asset`)

**Interfaces:**
- Consumes: nada anterior.
- Produces:
  - Tabela `public.assets(id uuid, filename text, storage_path text unique, kind text, mime_type text, size_bytes bigint, created_at timestamptz)`.
  - Bucket público `assets` no Storage.
  - `assetKindFromMime(mime: string): "video" | "image" | "audio" | "pdf" | "other"` em `lib/assets/kind.ts`.
  - `formatBytes(n: number): string` em `lib/assets/kind.ts` (ex.: `8200000` → `"7.8 MB"`).
  - Tipo `Asset` em `lib/db/types.ts`.

- [ ] **Step 1: Escrever os testes falhando**

Create `lib/assets/kind.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { assetKindFromMime, formatBytes } from "@/lib/assets/kind";

describe("assetKindFromMime", () => {
  it("classifica por prefixo/typo de mime", () => {
    expect(assetKindFromMime("video/mp4")).toBe("video");
    expect(assetKindFromMime("image/png")).toBe("image");
    expect(assetKindFromMime("audio/mpeg")).toBe("audio");
    expect(assetKindFromMime("application/pdf")).toBe("pdf");
  });
  it("cai em other no desconhecido", () => {
    expect(assetKindFromMime("application/zip")).toBe("other");
  });
});

describe("formatBytes", () => {
  it("formata em unidade legível pt-BR", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(8_200_000)).toBe("7.8 MB");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npm test -- lib/assets/kind.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar `lib/assets/kind.ts`**

```ts
export type AssetKind = "video" | "image" | "audio" | "pdf" | "other";

export function assetKindFromMime(mime: string): AssetKind {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return "other";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- lib/assets/kind.test.ts`
Expected: PASS (2 describes, 4 asserts no total).

- [ ] **Step 5: Adicionar o tipo `Asset` em `lib/db/types.ts`**

Append ao final de `lib/db/types.ts`:
```ts
export type Asset = {
  id: string;
  filename: string;
  storage_path: string;
  kind: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};
```

- [ ] **Step 6: Criar a migração (tabela + bucket + policies)**

Create `supabase/migrations/0002_assets.sql`:
```sql
-- tabela de metadados de mídias
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null unique,
  kind text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.assets enable row level security;

drop policy if exists "auth all assets" on public.assets;
create policy "auth all assets" on public.assets for all to authenticated using (true) with check (true);

-- bucket público de mídias
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do update set public = true;

-- policies de storage no bucket assets
drop policy if exists "assets read public" on storage.objects;
create policy "assets read public" on storage.objects
  for select using (bucket_id = 'assets');

drop policy if exists "assets write auth" on storage.objects;
create policy "assets write auth" on storage.objects
  for insert to authenticated with check (bucket_id = 'assets');

drop policy if exists "assets delete auth" on storage.objects;
create policy "assets delete auth" on storage.objects
  for delete to authenticated using (bucket_id = 'assets');
```

- [ ] **Step 7: Aplicar a migração no Supabase**

Carregue `select:mcp__claude_ai_Supabase__apply_migration,mcp__claude_ai_Supabase__execute_sql` (ToolSearch). Aplique com `project_id` = `gtctjfoitstbjkzpfpgk`, `name` = `assets`, `query` = conteúdo exato do arquivo `supabase/migrations/0002_assets.sql`.

- [ ] **Step 8: Verificar tabela e bucket**

Rode com `execute_sql`:
```sql
select
  (select count(*) from public.assets) as assets,
  (select public from storage.buckets where id = 'assets') as bucket_publico;
```
Expected: `assets = 0`, `bucket_publico = true`. Mostre o resultado real.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: schema assets + bucket Storage público + utils de mídia"
```

---

### Task 2: Acesso a dados + upload (browser) + server action de registro

**Files:**
- Create: `lib/db/assets.ts`
- Create: `app/(app)/midias/actions.ts`
- Create: `lib/assets/storage-path.ts`
- Test: `lib/assets/storage-path.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase` (`@/lib/supabase/server`), `Asset` (`@/lib/db/types`), `assetKindFromMime` (`@/lib/assets/kind`).
- Produces:
  - `listAssets(): Promise<Asset[]>` em `lib/db/assets.ts` (ordena por `created_at desc`).
  - `buildStoragePath(filename: string, seed: string): string` em `lib/assets/storage-path.ts` — gera caminho seguro `YYYY/<seed>-<slug-do-arquivo>` evitando colisão.
  - Server actions em `app/(app)/midias/actions.ts`:
    - `registerAssetAction(input: { filename: string; storagePath: string; mime: string; size: number }): Promise<void>`
    - `deleteAssetAction(id: string, storagePath: string): Promise<void>`

- [ ] **Step 1: Escrever o teste falhando de `buildStoragePath`**

Create `lib/assets/storage-path.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildStoragePath } from "@/lib/assets/storage-path";

describe("buildStoragePath", () => {
  it("sanitiza o nome e prefixa com a seed", () => {
    expect(buildStoragePath("Vídeo Lucas 20s.mp4", "abc123")).toBe("abc123-video-lucas-20s.mp4");
  });
  it("preserva a extensão e colapsa caracteres inválidos", () => {
    expect(buildStoragePath("Case  Gustavo!!.MP4", "x")).toBe("x-case-gustavo.MP4");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npm test -- lib/assets/storage-path.test.ts`
Expected: FAIL — import não resolvido.

- [ ] **Step 3: Implementar `lib/assets/storage-path.ts`**

```ts
export function buildStoragePath(filename: string, seed: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot > 0 ? filename.slice(dot + 1) : "";
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const slug = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ext ? `${seed}-${slug}.${ext}` : `${seed}-${slug}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- lib/assets/storage-path.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Implementar o acesso a dados**

Create `lib/db/assets.ts`:
```ts
import { createServerSupabase } from "@/lib/supabase/server";
import type { Asset } from "@/lib/db/types";

export async function listAssets(): Promise<Asset[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao carregar mídias: ${error.message}`);
  return (data ?? []) as Asset[];
}
```

- [ ] **Step 6: Implementar as server actions**

Create `app/(app)/midias/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { assetKindFromMime } from "@/lib/assets/kind";

export async function registerAssetAction(input: {
  filename: string;
  storagePath: string;
  mime: string;
  size: number;
}): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("assets").insert({
    filename: input.filename,
    storage_path: input.storagePath,
    kind: assetKindFromMime(input.mime),
    mime_type: input.mime,
    size_bytes: input.size,
  });
  if (error) throw new Error(`Falha ao registrar mídia: ${error.message}`);
  revalidatePath("/midias");
}

export async function deleteAssetAction(id: string, storagePath: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error: storageError } = await supabase.storage.from("assets").remove([storagePath]);
  if (storageError) throw new Error(`Falha ao remover arquivo: ${storageError.message}`);
  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) throw new Error(`Falha ao remover mídia: ${error.message}`);
  revalidatePath("/midias");
}
```

- [ ] **Step 7: Validar tipos + testes**

Run: `npx tsc --noEmit && npm test`
Expected: tsc limpo; todos os testes verdes.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: acesso a dados de assets + upload server actions"
```

---

### Task 3: Tela Mídias — upload, grid e filtros

**Files:**
- Modify: `app/(app)/midias/page.tsx` (substitui o placeholder)
- Create: `app/(app)/midias/_components/upload-zone.tsx` (client)
- Create: `app/(app)/midias/_components/asset-grid.tsx` (client)

**Interfaces:**
- Consumes: `listAssets` (`@/lib/db/assets`), `Asset` (`@/lib/db/types`), `registerAssetAction`/`deleteAssetAction` (`./actions`), `createBrowserSupabase` (`@/lib/supabase/client`), `buildStoragePath` (`@/lib/assets/storage-path`), `assetKindFromMime`/`formatBytes` (`@/lib/assets/kind`).
- Produces: a rota `/midias` funcional (upload + listagem + filtros).

- [ ] **Step 1: Implementar a zona de upload (client)**

Create `app/(app)/midias/_components/upload-zone.tsx`:
```tsx
"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { buildStoragePath } from "@/lib/assets/storage-path";
import { registerAssetAction } from "../actions";

export function UploadZone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    const supabase = createBrowserSupabase();
    try {
      for (const file of Array.from(files)) {
        const seed = Math.random().toString(36).slice(2, 10);
        const path = buildStoragePath(file.name, seed);
        const { error: upErr } = await supabase.storage.from("assets").upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
        if (upErr) throw new Error(upErr.message);
        await registerAssetAction({
          filename: file.name,
          storagePath: path,
          mime: file.type || "application/octet-stream",
          size: file.size,
        });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no upload.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        className="block rounded-xl border-2 border-dashed border-line bg-white py-8 text-center cursor-pointer hover:border-emerald hover:bg-emerald/5 transition"
      >
        <div className="font-display font-semibold">{busy ? "Enviando..." : "Arraste arquivos aqui ou clique para enviar"}</div>
        <p className="text-sm text-muted mt-1">MP4, PNG, JPG, MP3, PDF · até 200MB por arquivo</p>
        <input ref={inputRef} type="file" className="hidden" multiple disabled={busy}
          onChange={(e) => handleFiles(e.target.files)} />
      </label>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Implementar o grid com filtros (client)**

Create `app/(app)/midias/_components/asset-grid.tsx`:
```tsx
"use client";
import { useMemo, useState, useTransition } from "react";
import type { Asset } from "@/lib/db/types";
import { formatBytes } from "@/lib/assets/kind";
import { deleteAssetAction } from "../actions";

const PUBLIC_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/`;

const KIND_LABEL: Record<string, string> = {
  video: "vídeo", image: "imagem", audio: "áudio", pdf: "pdf", other: "arquivo",
};
const ICON: Record<string, string> = { video: "▶", image: "🖼", audio: "🔊", pdf: "📄", other: "📁" };

export function AssetGrid({ assets }: { assets: Asset[] }) {
  const [filter, setFilter] = useState<"all" | "video" | "image" | "audio">("all");
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    return assets.filter((a) => {
      const okKind = filter === "all" || a.kind === filter;
      const okQuery = a.filename.toLowerCase().includes(query.toLowerCase());
      return okKind && okQuery;
    });
  }, [assets, filter, query]);

  const tabs: { key: typeof filter; label: string }[] = [
    { key: "all", label: "Todas" }, { key: "video", label: "Vídeos" },
    { key: "image", label: "Imagens" }, { key: "audio", label: "Áudios" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-line/40 rounded-lg p-1">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${filter === t.key ? "bg-white shadow-sm" : "text-muted"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar mídia…"
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm w-64" />
        <span className="text-xs text-muted font-mono ml-auto">{visible.length} arquivo(s)</span>
      </div>

      {visible.length === 0 ? (
        <p className="text-muted text-sm">Nenhuma mídia ainda. Envie a primeira acima.</p>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {visible.map((a) => {
            const url = PUBLIC_BASE + a.storage_path;
            return (
              <div key={a.id} className="rounded-xl border border-line bg-white overflow-hidden">
                <div className="aspect-video bg-ink flex items-center justify-center text-paper text-3xl">{ICON[a.kind] ?? "📁"}</div>
                <div className="p-3">
                  <div className="font-mono text-sm truncate" title={a.filename}>{a.filename}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted font-mono">
                    <span className="rounded bg-paper border border-line px-1.5">{KIND_LABEL[a.kind] ?? a.kind}</span>
                    <span>{formatBytes(a.size_bytes)}</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <a href={url} target="_blank" rel="noreferrer" className="flex-1 text-center rounded-lg border border-line text-xs py-1.5 hover:bg-paper">Baixar</a>
                    <button onClick={() => navigator.clipboard.writeText(url)} className="flex-1 rounded-lg border border-line text-xs py-1.5 hover:bg-paper">Copiar link</button>
                  </div>
                  <button
                    onClick={() => { if (confirm(`Remover ${a.filename}?`)) startTransition(async () => { await deleteAssetAction(a.id, a.storage_path); }); }}
                    disabled={pending}
                    className="w-full mt-2 text-xs text-muted hover:text-risk">remover</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Reescrever a página Mídias (Server Component)**

Replace `app/(app)/midias/page.tsx`:
```tsx
import { listAssets } from "@/lib/db/assets";
import { UploadZone } from "./_components/upload-zone";
import { AssetGrid } from "./_components/asset-grid";

export default async function MidiasPage() {
  const assets = await listAssets();
  return (
    <div className="p-8">
      <div className="font-mono text-xs uppercase tracking-widest text-muted">Biblioteca global · o Infra pega daqui</div>
      <h1 className="font-display font-bold text-3xl mt-1 mb-6">Mídias</h1>
      <div className="mb-6"><UploadZone /></div>
      <AssetGrid assets={assets} />
    </div>
  );
}
```

- [ ] **Step 4: Validar tipos + build + testes**

Run: `export PATH=/tmp/node-v22.16.0-darwin-arm64/bin:$PATH && npx tsc --noEmit && npm run build && npm test`
Expected: tsc limpo; build OK (`/midias` presente); testes verdes.

- [ ] **Step 5: Verificação manual (dev server + logado)**

`npm run dev` → logar → **Mídias**: arrastar um arquivo (ex.: uma imagem pequena) → aparece no grid; "Copiar link" copia a URL pública e ela abre o arquivo; filtrar por tipo e buscar funcionam; "remover" apaga do grid e do Storage.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: tela Mídias — upload, grid e filtros"
```

---

## Self-Review (preenchido)

- **Cobertura do spec (Seção 3 `assets`, Seção 6 Mídias):** bucket+tabela+RLS ✓ Task 1; acesso a dados+upload+delete ✓ Task 2; tela com upload, filtros (tipo/busca), baixar/copiar link ✓ Task 3. "Usado em N campanhas" fica para quando existirem campanhas (planos seguintes) — fora deste escopo, anotado.
- **Placeholders:** nenhum "TBD"/"TODO"; todo passo tem código/SQL/comando concreto.
- **Consistência de tipos:** `Asset` definido na Task 1 e usado nas Tasks 2-3; `assetKindFromMime`/`formatBytes` (Task 1) consumidos nas Tasks 2-3; `buildStoragePath` (Task 2) consumido pela UploadZone (Task 3); `registerAssetAction`/`deleteAssetAction` com as mesmas assinaturas entre Task 2 e Task 3.
