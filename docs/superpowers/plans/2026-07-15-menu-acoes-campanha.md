# Menu de ações (⋯) na lista de campanhas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um menu ⋯ por linha na lista de campanhas, com Renomear, Duplicar e Excluir (este atrás de type-to-confirm na palavra `Delete`).

**Architecture:** Duas server actions novas (`renameCampaignAction`, `deleteCampaignAction`) em `actions.ts`; um client component `CampaignRowMenu` (kebab + 3 modais) usando `useTransition`; a lista `page.tsx` (server component) ganha uma coluna com o menu. Excluir apoia-se no `on delete cascade` já existente. Duplicar reaproveita a action atual.

**Tech Stack:** Next.js (App Router, server actions) + TypeScript + Tailwind + Supabase + Vitest. PT-BR.

## Global Constraints

- **Sem migration.** Excluir usa o `on delete cascade` de `campaign_touches`, `campaign_group_posts`, `chat_messages`, `scheduled_sends`.
- **Sem tocar no caminho de envio / fila / worker.**
- **Type-to-confirm do Excluir:** o botão só habilita quando `deleteConfirm.trim() === "Delete"` (exato, case-sensitive).
- **Copy PT-BR.** Tokens de cor existentes (`text-risk`, `bg-risk`, `bg-emerald`/`bg-emeraldd`, `border-line`, `bg-paper`, `text-muted`, `text-ink2`, `bg-ink/40`).
- **Node vem do nvm:** se `node`/`npx` não existirem, rode antes `export NVM_DIR="$HOME/.nvm"; \. "$NVM_DIR/nvm.sh"`.

---

### Task 1: Server actions — renomear e excluir

Duas actions em `app/(app)/campanhas/actions.ts`. Sem teste de unidade (server actions batendo no Supabase; verificação por typecheck + suíte + uso manual).

**Files:**
- Modify: `app/(app)/campanhas/actions.ts` (adicionar ao final do arquivo)

**Interfaces:**
- Produces:
  - `renameCampaignAction(campaignId: string, name: string): Promise<void>`
  - `deleteCampaignAction(campaignId: string): Promise<void>`
- Consumes (já importados no arquivo): `revalidatePath`, `createServerSupabase`.

- [ ] **Step 1: Adicionar as duas actions**

No fim de `app/(app)/campanhas/actions.ts`, acrescentar:

```ts
export async function renameCampaignAction(campaignId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("O nome não pode ficar vazio.");
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("campaigns")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", campaignId);
  if (error) throw new Error(`Falha ao renomear campanha: ${error.message}`);
  revalidatePath("/campanhas");
  revalidatePath(`/campanhas/${campaignId}`);
}

// Exclusão física: o on delete cascade apaga toques, posts, chat e a fila
// (scheduled_sends) desta campanha. A barreira contra acidente é o type-to-confirm
// na UI (a pessoa digita "Delete"); aqui não há checagem de status.
export async function deleteCampaignAction(campaignId: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("campaigns").delete().eq("id", campaignId);
  if (error) throw new Error(`Falha ao excluir campanha: ${error.message}`);
  revalidatePath("/campanhas");
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Suíte**

Run: `npx vitest run`
Expected: PASS (nenhum teste depende destas actions; nada quebra).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/campanhas/actions.ts"
git commit -m "feat: actions de renomear e excluir campanha"
```

---

### Task 2: Componente `CampaignRowMenu` (kebab + 3 modais)

**Files:**
- Create: `app/(app)/campanhas/_components/campaign-row-menu.tsx`

**Interfaces:**
- Consumes: `renameCampaignAction`, `deleteCampaignAction` (Task 1) e `duplicateCampaignAction` (já existente) de `../actions`.
- Produces: `CampaignRowMenu({ campaignId: string; name: string })` (default-free named export).

- [ ] **Step 1: Criar o componente**

Criar `app/(app)/campanhas/_components/campaign-row-menu.tsx`:

```tsx
"use client";
import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renameCampaignAction, deleteCampaignAction, duplicateCampaignAction } from "../actions";

type Mode = null | "rename" | "duplicate" | "delete";

export function CampaignRowMenu({ campaignId, name }: { campaignId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [renameValue, setRenameValue] = useState(name);
  const [dupAnchor, setDupAnchor] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function closeModal() {
    setMode(null);
    setDeleteConfirm("");
  }

  function openMode(m: Mode) {
    setOpen(false);
    if (m === "rename") setRenameValue(name);
    if (m === "duplicate") setDupAnchor("");
    if (m === "delete") setDeleteConfirm("");
    setMode(m);
  }

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Ações da campanha"
        className="rounded-lg px-2 py-1 text-muted hover:bg-paper hover:text-ink"
      >
        ⋯
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-line bg-white py-1 shadow-lg">
          <button role="menuitem" onClick={() => openMode("rename")} className="block w-full px-3 py-2 text-left text-sm hover:bg-paper">Renomear</button>
          <button role="menuitem" onClick={() => openMode("duplicate")} className="block w-full px-3 py-2 text-left text-sm hover:bg-paper">Duplicar</button>
          <button role="menuitem" onClick={() => openMode("delete")} className="block w-full px-3 py-2 text-left text-sm text-risk hover:bg-paper">Excluir</button>
        </div>
      )}

      {mode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={closeModal}>
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-xl text-left" onClick={(e) => e.stopPropagation()}>
            {mode === "rename" && (
              <>
                <h3 className="font-display font-bold text-lg mb-3">Renomear campanha</h3>
                <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus className="w-full rounded-lg border border-line p-2 text-sm" />
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={closeModal} className="rounded-lg border border-line px-3 py-1.5 text-sm">Cancelar</button>
                  <button
                    disabled={pending || !renameValue.trim()}
                    onClick={() => startTransition(async () => { await renameCampaignAction(campaignId, renameValue); closeModal(); router.refresh(); })}
                    className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50"
                  >
                    {pending ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              </>
            )}

            {mode === "duplicate" && (
              <>
                <h3 className="font-display font-bold text-lg mb-1">Duplicar campanha</h3>
                <p className="text-sm text-muted mb-3">Escolha a nova data-âncora da cópia.</p>
                <input type="datetime-local" value={dupAnchor} onChange={(e) => setDupAnchor(e.target.value)} autoFocus className="w-full rounded-lg border border-line p-2 text-sm" />
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={closeModal} className="rounded-lg border border-line px-3 py-1.5 text-sm">Cancelar</button>
                  <button
                    disabled={pending || !dupAnchor}
                    onClick={() => startTransition(async () => { const id = await duplicateCampaignAction(campaignId, dupAnchor, ""); router.push(`/campanhas/${id}`); })}
                    className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50"
                  >
                    {pending ? "Duplicando…" : "Duplicar nesta data"}
                  </button>
                </div>
              </>
            )}

            {mode === "delete" && (
              <>
                <h3 className="font-display font-bold text-lg mb-1 text-risk">Excluir campanha</h3>
                <p className="text-sm text-ink2 mb-3">Você vai excluir <b>{name}</b>. Isso apaga a campanha e todos os envios já agendados dela — os pendentes são cancelados e o histórico de enviados some. <b>Não tem desfazer.</b></p>
                <label className="block text-sm text-muted mb-1">Digite <span className="font-mono text-ink">Delete</span> para confirmar:</label>
                <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} autoFocus className="w-full rounded-lg border border-line p-2 text-sm" />
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={closeModal} className="rounded-lg border border-line px-3 py-1.5 text-sm">Cancelar</button>
                  <button
                    disabled={pending || deleteConfirm.trim() !== "Delete"}
                    onClick={() => startTransition(async () => { await deleteCampaignAction(campaignId); closeModal(); router.refresh(); })}
                    className="rounded-lg bg-risk hover:opacity-90 text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50"
                  >
                    {pending ? "Excluindo…" : "Excluir definitivamente"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (as três actions importadas existem).

- [ ] **Step 3: Suíte**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/campanhas/_components/campaign-row-menu.tsx"
git commit -m "feat: componente CampaignRowMenu (kebab renomear/duplicar/excluir)"
```

---

### Task 3: Ligar o menu na lista de campanhas

**Files:**
- Modify: `app/(app)/campanhas/page.tsx`

**Interfaces:**
- Consumes: `CampaignRowMenu` (Task 2).

- [ ] **Step 1: Importar o componente**

Em `app/(app)/campanhas/page.tsx`, adicionar aos imports do topo:

```tsx
import { CampaignRowMenu } from "./_components/campaign-row-menu";
```

- [ ] **Step 2: Coluna no cabeçalho**

No `<thead>`, na linha de cabeçalhos, após o `<th ...>Criada</th>`, adicionar uma coluna vazia para o menu:

```tsx
                <th className="px-4 py-3 w-12"><span className="sr-only">Ações</span></th>
```

- [ ] **Step 3: Célula do menu em cada linha**

No `<tbody>`, dentro do `campaigns.map((c) => ( ... ))`, após a `<td>` de "Criada" (a que renderiza `formatDateTimeBR`), adicionar a célula do menu:

```tsx
                  <td className="px-4 py-3 text-right"><CampaignRowMenu campaignId={c.id} name={c.name} /></td>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Suíte**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Verificação manual (visual)**

Subir o app (`npm run dev`), abrir `/campanhas`:
- O ⋯ aparece à direita de cada linha; abre o menu; fecha ao clicar fora e no `Esc`.
- **Renomear** → modal com o nome atual; salvar reflete o novo nome na lista.
- **Duplicar** → modal com o seletor de data; duplicar navega para a cópia.
- **Excluir** → modal com o aviso; o botão "Excluir definitivamente" só habilita ao digitar `Delete`; excluir some a campanha da lista. (Testar com uma campanha de teste; se for aprovada, conferir que suas linhas somem da fila em `/disparos`.)

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/campanhas/page.tsx"
git commit -m "feat: coluna do menu de acoes na lista de campanhas"
```

---

## Self-Review

**Spec coverage:**
- ① `renameCampaignAction` + `deleteCampaignAction` → Task 1. ✔
- ② `CampaignRowMenu` (kebab + dropdown fecha-fora/Esc + 3 modais; type-to-confirm `Delete`; duplicar reusa action) → Task 2. ✔
- ③ Coluna do menu em `page.tsx` (segue server component) → Task 3. ✔
- Sem migration / sem tocar no envio → Global Constraints, respeitado. ✔

**Placeholder scan:** todo step tem código/comando real e output esperado. Sem TBD/TODO. (Sem teste de unidade: a feature é UI + server actions; verificação por typecheck + suíte + visual — declarado explicitamente.)

**Type consistency:** `renameCampaignAction(campaignId: string, name: string)` e `deleteCampaignAction(campaignId: string)` (Task 1) são importadas e chamadas com esses tipos na Task 2; `duplicateCampaignAction(campaignId, anchor, "")` mantém a assinatura existente (retorna o novo id usado em `router.push`). `CampaignRowMenu({ campaignId, name })` (Task 2) é consumido com `c.id`/`c.name` na Task 3, ambos `string` no tipo `Campaign`. Import `../actions` correto a partir de `campanhas/_components/`.
