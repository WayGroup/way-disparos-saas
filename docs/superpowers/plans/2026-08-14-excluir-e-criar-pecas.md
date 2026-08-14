# Excluir peças e criar peça de grupo à mão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poder excluir uma peça de campanha (nas duas trilhas), limpar uma trilha inteira, e criar peça de grupo à mão — hoje só a IA cria peças e nada nunca é removido.

**Architecture:** Uma função pura nova monta a linha da peça à mão compondo cinco helpers que já existem (`nextSortOrder`, `pickReferenceGroups`, `slugCode`, `buildCode`, `computeSendAt`). Quatro server actions novas fazem as escritas, seguindo a regra que o arquivo já pratica: toda mudança em peça de grupo termina em `rescheduleCampaign`, toque não (a trilha API não entra na fila). A UI ganha um botão Excluir no rodapé de cada cartão, um Limpar trilha com type-to-confirm, e um formulário inline de peça nova.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Tailwind v4, Supabase, Vitest. UI em PT-BR.

## Global Constraints

- **Sem migration.** Nenhuma coluna, tabela ou constraint nova.
- **Criar à mão só na trilha Grupos.** Toque da API individual continua nascendo só da IA.
- **Toda ação que muda peça de GRUPO termina em `await rescheduleCampaign(campaignId)`.** Ação que mexe só em toque **não** chama — a trilha API é manual e não entra na fila (`buildGroupPieces` só monta Grupos; `updateTouchAction` não chama, `updateGroupPostAction` chama).
- **Não renumerar `sort_order` ao excluir.** `nextSortOrder` é `max + 1`, então buraco é inofensivo e peça nova nunca colide.
- **Endereçamento:** toque por `(campaign_id, sort_order)` — é o único que ele tem; peça de grupo por `id`.
- **Copy e comentários em PT-BR.** Tokens de cor existentes: `text-risk`, `border-risk`, `bg-risk/10`, `bg-ink/40`, `border-line`, `bg-paper`, `text-muted`, `text-ink`, `text-ink2`, `bg-emerald`/`bg-emeraldd`, `text-emeraldd`.
- **Type-to-confirm de Limpar trilha:** o botão só habilita quando o campo, após `trim()`, for exatamente `Limpar`.
- **Imports absolutos com `@/`**, exceto os relativos já padrão dentro de `_components/` (`../../actions`) — mantenha o estilo do arquivo editado.
- Comandos de verificação: `npx tsc --noEmit` e `npm test` (baseline atual: 249 testes passando).

---

### Task 1: `buildManualGroupPost` — a montagem da peça à mão

TDD: o teste vem antes. Função pura, sem banco e sem rede. É a costura entre cinco helpers já testados — e é na costura que o erro mora.

**Files:**
- Create: `lib/campaign-manual-post.ts`
- Test: `lib/campaign-manual-post.test.ts`

**Interfaces:**
- Consumes (já existem, não altere nenhum): `nextSortOrder(items: { sort_order: number }[]): number` e `pickReferenceGroups(posts: { sort_order: number; community_ids: string[] }[]): string[]` e `slugCode(role: string): string` de `@/lib/campaign-refine`; `buildCode(recipeType: string, slotCode: string, anchor: string): string` de `@/lib/ai/nomenclature`; `computeSendAt(anchor: string, offsetDays: number, offsetTime: string, offsetMinutes?: number): string` de `@/lib/schedule`.
- Produces (a Task 2 depende destes nomes, exatos): `ManualPostInput`, `ManualPostDraft`, `buildManualGroupPost(input, ctx)`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `lib/campaign-manual-post.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildManualGroupPost, type ManualPostInput } from "@/lib/campaign-manual-post";

/** Âncora com hora: sem hora, `new Date("2026-08-18")` vira meia-noite UTC e o dia local vira 17. */
const ANCORA = "2026-08-18 19:07";

const EXISTENTES = [
  { sort_order: 0, community_ids: ["g1", "g2", "g3"] },
  { sort_order: 1, community_ids: ["g1"] },
  { sort_order: 2, community_ids: [] },
];

function ctx(over: Partial<Parameters<typeof buildManualGroupPost>[1]> = {}) {
  return { existing: EXISTENTES, recipeType: "webinario", anchor: ANCORA, ...over };
}

function input(over: Partial<ManualPostInput> = {}): ManualPostInput {
  return {
    offset_label: "D-1",
    role: "Lembrete",
    copy: "Amanhã tem.",
    media: "",
    offset_days: -1,
    offset_time: "14:00",
    ...over,
  };
}

describe("buildManualGroupPost", () => {
  it("numera a partir da maior existente", () => {
    expect(buildManualGroupPost(input(), ctx()).sort_order).toBe(3);
  });

  it("a primeira peça de uma trilha vazia começa em zero e sem grupos", () => {
    const draft = buildManualGroupPost(input(), ctx({ existing: [] }));
    expect(draft.sort_order).toBe(0);
    expect(draft.community_ids).toEqual([]);
  });

  it("herda os grupos da peça que tem mais grupos", () => {
    expect(buildManualGroupPost(input(), ctx()).community_ids).toEqual(["g1", "g2", "g3"]);
  });

  it("deixa `communities` vazio — peça à mão não tem sugestão da IA", () => {
    expect(buildManualGroupPost(input(), ctx()).communities).toBe("");
  });

  it("monta o código da mensagem a partir do tipo de receita, do papel e da âncora", () => {
    expect(buildManualGroupPost(input(), ctx()).message_code).toBe("webinario_lembrete_1808");
  });

  it("calcula a data a partir da âncora, dos dias e da hora", () => {
    expect(buildManualGroupPost(input(), ctx()).send_at).toBe("2026-08-17 14:00");
  });

  it("sem âncora, a peça nasce sem data (o validador reclama na aprovação)", () => {
    const draft = buildManualGroupPost(input(), ctx({ anchor: "" }));
    expect(draft.send_at).toBe("");
    expect(draft.message_code).toBe("webinario_lembrete");
  });

  it("copia rótulo, papel, mensagem e mídia sem alterar", () => {
    const draft = buildManualGroupPost(
      input({ offset_label: "D0", role: "Lembrete", copy: "Texto", media: "Print da tela" }),
      ctx(),
    );
    expect(draft.offset_label).toBe("D0");
    expect(draft.role).toBe("Lembrete");
    expect(draft.copy).toBe("Texto");
    expect(draft.media).toBe("Print da tela");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/campaign-manual-post.test.ts`
Expected: FAIL — o módulo `@/lib/campaign-manual-post` não existe.

- [ ] **Step 3: Implementar**

Criar `lib/campaign-manual-post.ts`:

```ts
import { buildCode } from "@/lib/ai/nomenclature";
import { computeSendAt } from "@/lib/schedule";
import { nextSortOrder, pickReferenceGroups, slugCode } from "@/lib/campaign-refine";

export type ManualPostInput = {
  offset_label: string;
  role: string;
  copy: string;
  media: string;
  /** Negativo = antes da âncora. */
  offset_days: number;
  /** "HH:mm". Vazio deixa a peça na hora da própria âncora. */
  offset_time: string;
};

export type ManualPostDraft = {
  sort_order: number;
  offset_label: string;
  role: string;
  communities: string;
  copy: string;
  media: string;
  message_code: string;
  send_at: string;
  community_ids: string[];
};

/**
 * Monta a linha de uma peça de grupo criada à mão.
 *
 * Não reimplementa nada: compõe os mesmos helpers que o chat de refino usa ao criar peça,
 * para que uma peça feita à mão seja indistinguível de uma peça da IA — mesma numeração,
 * mesmo padrão de código, mesma forma de datar.
 */
export function buildManualGroupPost(
  input: ManualPostInput,
  ctx: {
    existing: { sort_order: number; community_ids: string[] }[];
    recipeType: string;
    anchor: string;
  },
): ManualPostDraft {
  return {
    sort_order: nextSortOrder(ctx.existing),
    offset_label: input.offset_label,
    role: input.role,
    // `communities` é a sugestão em texto livre da IA. Peça à mão não tem sugestão, e
    // deixá-la vazia impede o casador de nomes de inventar alvo por conta própria.
    communities: "",
    copy: input.copy,
    media: input.media,
    message_code: buildCode(ctx.recipeType, slugCode(input.role), ctx.anchor),
    send_at: computeSendAt(ctx.anchor, input.offset_days, input.offset_time),
    community_ids: pickReferenceGroups(ctx.existing),
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/campaign-manual-post.test.ts`
Expected: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/campaign-manual-post.ts lib/campaign-manual-post.test.ts
git commit -m "feat: buildManualGroupPost monta a peca de grupo feita a mao"
```

---

### Task 2: As quatro server actions

Sem teste de unidade: são actions batendo em Supabase. A lógica pura já está coberta pela Task 1.

**Files:**
- Modify: `app/(app)/campanhas/actions.ts`

**Interfaces:**
- Consumes (Task 1): `buildManualGroupPost`, `ManualPostInput` de `@/lib/campaign-manual-post`. Já no arquivo: `createServerSupabase`, `getCampaign`, `getRecipe`, `revalidatePath`, e a função privada `rescheduleCampaign(campaignId: string)`.
- Produces (as Tasks 3 e 4 chamam estas, exatas):
  - `deleteTouchAction(campaignId: string, sortOrder: number): Promise<void>`
  - `deleteGroupPostAction(campaignId: string, postId: string): Promise<void>`
  - `clearTrackAction(campaignId: string, track: "api" | "grupos"): Promise<void>`
  - `createGroupPostAction(campaignId: string, input: ManualPostInput): Promise<void>`

- [ ] **Step 1: Importar a função pura**

Em `app/(app)/campanhas/actions.ts`, acrescentar ao bloco de imports do topo:

```ts
import { buildManualGroupPost, type ManualPostInput } from "@/lib/campaign-manual-post";
```

- [ ] **Step 2: Acrescentar as quatro actions ao final do arquivo**

```ts
// ---------------------------------------------------------------------------
// Excluir e criar peças
// ---------------------------------------------------------------------------

/**
 * Exclui um toque. SEM replanejar: a trilha API individual é manual e nunca entra na
 * fila (buildGroupPieces só monta a trilha Grupos), então não há envio a reconstruir.
 */
export async function deleteTouchAction(campaignId: string, sortOrder: number): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("campaign_touches")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("sort_order", sortOrder);
  if (error) throw new Error(`Falha ao excluir o toque: ${error.message}`);
  revalidatePath(`/campanhas/${campaignId}`);
}

/**
 * Exclui uma peça de grupo.
 *
 * O `on delete cascade` de scheduled_sends.post_id (migração 0015) leva junto TODAS as
 * linhas de envio desta peça — inclusive as com status 'enviado'. O histórico dela some,
 * e é isso que a confirmação na UI avisa. Depois, o replanejamento reconstrói a fila do
 * resto da campanha, preservando um "Enviar agora" em voo.
 */
export async function deleteGroupPostAction(campaignId: string, postId: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("campaign_group_posts").delete().eq("id", postId);
  if (error) throw new Error(`Falha ao excluir a peça: ${error.message}`);
  await rescheduleCampaign(campaignId);
  revalidatePath(`/campanhas/${campaignId}`);
}

/** Apaga todas as peças de uma trilha. A barreira contra acidente é o type-to-confirm na UI. */
export async function clearTrackAction(
  campaignId: string,
  track: "api" | "grupos",
): Promise<void> {
  const supabase = await createServerSupabase();
  const table = track === "api" ? "campaign_touches" : "campaign_group_posts";
  const { error } = await supabase.from(table).delete().eq("campaign_id", campaignId);
  if (error) throw new Error(`Falha ao limpar a trilha: ${error.message}`);
  if (track === "grupos") await rescheduleCampaign(campaignId);
  revalidatePath(`/campanhas/${campaignId}`);
}

/**
 * Cria uma peça de grupo à mão.
 *
 * A âncora é resolvida do mesmo jeito que o refino faz (input is_anchor da receita cruzado
 * com os valores da campanha). Sem âncora a peça nasce sem data: ela existe, mas não entra
 * na fila, e o validateSchedulable reclama na hora de aprovar — falha visível, não silenciosa.
 */
export async function createGroupPostAction(
  campaignId: string,
  input: ManualPostInput,
): Promise<void> {
  const role = input.role.trim();
  const copy = input.copy.trim();
  if (!role) throw new Error("A peça precisa de um papel.");
  if (!copy) throw new Error("A peça precisa de uma mensagem.");

  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campanha não encontrada.");

  const recipe = campaign.recipe_id ? await getRecipe(campaign.recipe_id) : null;
  const anchorLabel = recipe?.inputs.find((i) => i.is_anchor)?.label ?? "";
  const anchorValue = anchorLabel ? (campaign.inputs[anchorLabel] ?? "") : "";

  const draft = buildManualGroupPost(
    { ...input, role, copy },
    {
      existing: campaign.group_posts,
      recipeType: recipe?.recipe_type ?? "",
      anchor: anchorValue,
    },
  );

  const { community_ids, ...row } = draft;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("campaign_group_posts")
    .insert({ campaign_id: campaignId, ...row })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar a peça: ${error.message}`);

  if (community_ids.length > 0) {
    const { error: e2 } = await supabase
      .from("campaign_group_post_communities")
      .insert(community_ids.map((community_id) => ({ post_id: data.id as string, community_id })));
    if (e2) throw new Error(`Peça criada, mas os grupos não foram vinculados: ${e2.message}`);
  }

  await rescheduleCampaign(campaignId);
  revalidatePath(`/campanhas/${campaignId}`);
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm test`
Expected: toda a suíte verde (249 da baseline + 8 da Task 1 = 257).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/campanhas/actions.ts"
git commit -m "feat: actions de excluir peca, limpar trilha e criar peca de grupo"
```

---

### Task 3: Botão Excluir nos dois cartões

**Files:**
- Modify: `app/(app)/campanhas/[id]/_components/touch-card.tsx`
- Modify: `app/(app)/campanhas/[id]/_components/post-card.tsx`
- Modify: `app/(app)/campanhas/[id]/_components/campaign-view.tsx`

**Interfaces:**
- Consumes (Task 2): `deleteTouchAction(campaignId, sortOrder)` e `deleteGroupPostAction(campaignId, postId)`, ambas de `../../actions`.
- Produces: `PostCard` passa a exigir a prop `aprovada: boolean`.

- [ ] **Step 1: Excluir no cartão do toque**

Em `touch-card.tsx`, acrescentar `deleteTouchAction` ao import que já vem de `../../actions`.

Depois da função `regenerate`, acrescentar:

```tsx
  function excluir() {
    const go = confirm(
      "Excluir este toque?\n\n" +
        "Ele some da campanha. A trilha API individual não gera envio, então nada agendado muda.\n\n" +
        "Não tem desfazer.",
    );
    if (!go) return;
    startTransition(async () => {
      await deleteTouchAction(campaignId, touch.sort_order);
      router.refresh();
    });
  }
```

No rodapé do modo leitura, dentro da `<div className="flex gap-3 shrink-0">` que já contém Editar e Regenerar, acrescentar como último botão:

```tsx
            <button onClick={excluir} disabled={pending} className="text-xs text-risk font-medium hover:underline disabled:opacity-50">Excluir</button>
```

- [ ] **Step 2: Excluir no cartão da peça de grupo**

Em `post-card.tsx`, acrescentar `deleteGroupPostAction` ao import que já vem de `../../actions`.

Na assinatura do componente, acrescentar a prop `aprovada`:

```tsx
export function PostCard({ campaignId, post, assets, groups, aprovada, highlight = false }: { campaignId: string; post: CampaignGroupPost; assets: Asset[]; groups: Community[]; aprovada: boolean; highlight?: boolean }) {
```

Depois da função `regenerate`, acrescentar:

```tsx
  function excluir() {
    // O texto muda com a consequência real: numa campanha aprovada, o cascade leva junto
    // a fila E o histórico de envios desta peça.
    const go = confirm(
      aprovada
        ? "Excluir esta peça?\n\n" +
          "Ela some da campanha, os envios pendentes dela são cancelados, e o histórico do que já saiu por esta peça some junto.\n\n" +
          "Não tem desfazer."
        : "Excluir esta peça?\n\nEla some da campanha.\n\nNão tem desfazer.",
    );
    if (!go) return;
    startTransition(async () => {
      await deleteGroupPostAction(campaignId, post.id);
      router.refresh();
    });
  }
```

No rodapé do modo leitura, na `<div className="mt-5 pt-3 border-t border-line flex justify-end items-start gap-4">`, acrescentar como último elemento, depois do `<SendNowButton …/>`:

```tsx
          <button onClick={excluir} disabled={pending} className="text-xs text-risk font-medium hover:underline disabled:opacity-50">Excluir</button>
```

- [ ] **Step 3: Passar `aprovada` na tela**

Em `campaign-view.tsx`, na renderização do `PostCard`, acrescentar a prop:

```tsx
                    <PostCard key={p.id} campaignId={campaign.id} post={p} assets={assets} groups={groups} aprovada={campaign.status === "aprovada"} />
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros. (Se sobrar erro apontando `aprovada` faltando, é outro lugar que renderiza `PostCard` — procure e passe a prop lá também.)

Run: `npm test`
Expected: toda a suíte verde.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/campanhas/[id]/_components/touch-card.tsx" "app/(app)/campanhas/[id]/_components/post-card.tsx" "app/(app)/campanhas/[id]/_components/campaign-view.tsx"
git commit -m "feat: botao de excluir peca nos dois cartoes"
```

---

### Task 4: Limpar trilha e criar peça à mão

**Files:**
- Create: `app/(app)/campanhas/[id]/_components/new-group-post-form.tsx`
- Modify: `app/(app)/campanhas/[id]/page.tsx`
- Modify: `app/(app)/campanhas/[id]/_components/campaign-view.tsx`

**Interfaces:**
- Consumes (Task 2): `clearTrackAction(campaignId, track)` e `createGroupPostAction(campaignId, input)` de `../../actions`; o tipo `ManualPostInput` de `@/lib/campaign-manual-post`.
- Produces: `CampaignView` passa a exigir a prop `anchor: string`.

- [ ] **Step 1: A página resolve a âncora e passa adiante**

O formulário mostra a data resultante antes de salvar, e para isso precisa da âncora — que hoje não chega no cliente (a página não carrega a receita).

Em `app/(app)/campanhas/[id]/page.tsx`, acrescentar o import:

```tsx
import { getRecipe } from "@/lib/db/recipes";
```

E, depois do `if (!campaign) notFound();`, acrescentar:

```tsx
  // A âncora vive na receita (input is_anchor) cruzada com os valores da campanha. O
  // formulário de peça nova usa para mostrar a data resultante antes de salvar.
  const recipe = campaign.recipe_id ? await getRecipe(campaign.recipe_id) : null;
  const anchorLabel = recipe?.inputs.find((i) => i.is_anchor)?.label ?? "";
  const anchor = anchorLabel ? (campaign.inputs[anchorLabel] ?? "") : "";
```

E passar na renderização:

```tsx
  return <CampaignView campaign={campaign} messages={messages} assets={assets} groups={groups} anchor={anchor} />;
```

- [ ] **Step 2: Criar o formulário**

Criar `app/(app)/campanhas/[id]/_components/new-group-post-form.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeSendAt } from "@/lib/schedule";
import type { ManualPostInput } from "@/lib/campaign-manual-post";
import { createGroupPostAction } from "../../actions";

export function NewGroupPostForm({
  campaignId,
  anchor,
  onClose,
}: {
  campaignId: string;
  anchor: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [f, setF] = useState<ManualPostInput>({
    offset_label: "",
    role: "",
    copy: "",
    media: "",
    offset_days: 0,
    offset_time: "",
  });

  // "1 dia antes às 14:00" vira uma data concreta antes de salvar — é o que a pessoa
  // consegue conferir. Mesma função que o servidor usa, então a prévia não mente.
  const previsto = computeSendAt(anchor, f.offset_days, f.offset_time);

  function salvar() {
    setErro(null);
    startTransition(async () => {
      try {
        await createGroupPostAction(campaignId, f);
        onClose();
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Algo deu errado.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-emerald/40 bg-white p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] font-mono uppercase text-muted">Rótulo</span>
          <input value={f.offset_label} onChange={(e) => setF({ ...f, offset_label: e.target.value })} placeholder="D-1" className="mt-1 w-full rounded-lg border border-line p-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-[10px] font-mono uppercase text-muted">Papel</span>
          <input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Lembrete" className="mt-1 w-full rounded-lg border border-line p-2 text-sm" />
        </label>
      </div>

      <label className="block">
        <span className="text-[10px] font-mono uppercase text-muted">Mensagem</span>
        <textarea value={f.copy} onChange={(e) => setF({ ...f, copy: e.target.value })} rows={4} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" />
      </label>

      <label className="block">
        <span className="text-[10px] font-mono uppercase text-muted">Briefing da mídia</span>
        <textarea value={f.media} onChange={(e) => setF({ ...f, media: e.target.value })} rows={2} placeholder="Deixe vazio para peça só-texto." className="mt-1 w-full rounded-lg border border-line p-2 text-sm" />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] font-mono uppercase text-muted">Dias (negativo = antes)</span>
          <input type="number" value={f.offset_days} onChange={(e) => setF({ ...f, offset_days: Number(e.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-[10px] font-mono uppercase text-muted">Hora (HH:mm)</span>
          <input value={f.offset_time} onChange={(e) => setF({ ...f, offset_time: e.target.value })} placeholder="14:00" className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" />
        </label>
      </div>

      <p className="font-mono text-xs text-muted">
        {previsto ? `Vai sair em ${previsto}` : "Sem data — confira a hora, ou a campanha está sem âncora."}
      </p>

      {erro && <p className="rounded-lg border border-risk/30 bg-risk/5 p-3 text-sm text-risk">{erro}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={salvar} disabled={pending || !f.role.trim() || !f.copy.trim()} className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50">
          {pending ? "Criando…" : "Criar peça"}
        </button>
        <button onClick={onClose} disabled={pending} className="rounded-lg border border-line text-sm px-3 py-1.5 disabled:opacity-50">Cancelar</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Ligar na tela — imports, props e estado**

Em `campaign-view.tsx`:

Acrescentar `clearTrackAction` à linha de import que **já existe**
(`import { approveAndScheduleAction } from "../../actions";`), deixando-a assim:

```tsx
import { approveAndScheduleAction, clearTrackAction } from "../../actions";
```

E acrescentar o componente novo aos imports locais, junto dos outros `./`:

```tsx
import { NewGroupPostForm } from "./new-group-post-form";
```

Acrescentar `anchor: string` às props do componente (junto de `campaign`, `messages`, `assets`, `groups`).

Este arquivo **já tem** `useState`, `useTransition` e `useRouter` importados, e já declara
`const router = useRouter();` — não duplique nenhum deles. Logo depois da linha
`const [past, setPast] = useState<string[]>([]);`, acrescentar:

```tsx
  const [limpando, setLimpando] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [criando, setCriando] = useState(false);
  const [pendingTrilha, startTrilha] = useTransition();
```

E a função, junto das outras funções do componente:

```tsx
  function limparTrilha() {
    startTrilha(async () => {
      await clearTrackAction(campaign.id, track);
      setLimpando(false);
      setConfirmacao("");
      router.refresh();
    });
  }
```

- [ ] **Step 4: O botão Limpar trilha**

No bloco de controles, logo depois da `</div>` que fecha o grupo de botões `API individual` / `Grupos`, acrescentar:

```tsx
        <button
          onClick={() => setLimpando(true)}
          className="font-mono text-xs text-muted hover:text-risk"
        >
          limpar trilha
        </button>
```

- [ ] **Step 5: O modal de type-to-confirm**

No final do JSX do componente, antes do fechamento do contêiner mais externo, acrescentar:

```tsx
      {limpando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-5">
            <h3 className="font-display font-bold text-lg">
              Limpar a trilha {track === "api" ? "API individual" : "Grupos"}?
            </h3>
            <p className="mt-2 text-sm text-ink2">
              Isso apaga as{" "}
              {track === "api" ? campaign.touches.length : campaign.group_posts.length} peça(s)
              desta trilha. Não tem desfazer.
              {track === "grupos" && campaign.status === "aprovada" && (
                <> Os envios pendentes delas são cancelados, e o histórico do que já saiu some junto.</>
              )}
              {track === "api" && (
                <> Só o chat de refino recria peças desta trilha — não existe criar toque à mão.</>
              )}
            </p>
            <input
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              placeholder="Digite Limpar"
              className="mt-3 w-full rounded-lg border border-line p-2 text-sm"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  setLimpando(false);
                  setConfirmacao("");
                }}
                className="rounded-lg border border-line px-3 py-1.5 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={limparTrilha}
                disabled={confirmacao.trim() !== "Limpar" || pendingTrilha}
                className="rounded-lg border border-risk bg-risk/10 px-3 py-1.5 text-sm font-semibold text-risk disabled:opacity-40"
              >
                {pendingTrilha ? "Limpando…" : "Limpar trilha"}
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 6: O botão Nova peça e o formulário**

Na lista da trilha Grupos, logo depois do `.map` que renderiza os `PostCard`, dentro da mesma `<div className="space-y-5 max-w-3xl">`, acrescentar:

```tsx
                  {criando ? (
                    <NewGroupPostForm
                      campaignId={campaign.id}
                      anchor={anchor}
                      onClose={() => setCriando(false)}
                    />
                  ) : (
                    <button
                      onClick={() => setCriando(true)}
                      className="w-full rounded-xl border border-dashed border-line py-3 text-sm font-medium text-muted hover:border-emerald/40 hover:text-emeraldd"
                    >
                      + Nova peça à mão
                    </button>
                  )}
```

- [ ] **Step 7: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm test`
Expected: toda a suíte verde (257 testes).

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/campanhas/[id]/_components/new-group-post-form.tsx" "app/(app)/campanhas/[id]/page.tsx" "app/(app)/campanhas/[id]/_components/campaign-view.tsx"
git commit -m "feat: limpar trilha e criar peca de grupo a mao"
```

---

## Verificação manual (depois da Task 4)

Rodar `npm run dev`. Use uma campanha **em rascunho** para tudo, menos onde estiver dito o contrário.

- [ ] **Excluir toque.** Na trilha API individual, Excluir num toque → confirmar → ele some; os outros continuam com os mesmos rótulos e códigos. A trilha Grupos não muda.
- [ ] **Excluir peça de grupo.** Na trilha Grupos, Excluir numa peça → confirmar → ela some. Em `/disparos`, os envios daquela peça sumiram da fila e os das outras continuam.
- [ ] **Excluir peça de campanha aprovada.** Numa campanha **aprovada**, o texto da confirmação precisa mencionar que os pendentes são cancelados e o histórico some. Confirme com uma campanha de teste, não com a Hotseat.
- [ ] **Numeração após excluir.** Depois de excluir uma peça do meio, criar uma peça nova: ela tem que receber um número maior que todos, sem colidir com nada nem reaproveitar o número da apagada.
- [ ] **Criar peça à mão.** Na trilha Grupos, "+ Nova peça à mão" → preencher papel, mensagem, dias e hora → a linha de prévia mostra a data calculada → Criar peça. Ela aparece na lista com o mesmo padrão de código das outras, já com os mesmos grupos, e entra na fila em `/disparos` no horário previsto.
- [ ] **Validação do formulário.** Sem papel ou sem mensagem, o botão Criar peça fica desabilitado.
- [ ] **Limpar trilha.** "limpar trilha" → o botão só habilita ao digitar `Limpar` → confirmar → a trilha esvazia e a outra fica intacta. Na trilha API o aviso precisa dizer que só o refino recria peças dela.

## Riscos conhecidos (do spec, não são bugs a corrigir aqui)

- Excluir peça de grupo apaga o histórico de envios dela, não só os pendentes — o cascade não distingue status. Mesmo comportamento já aceito na exclusão de campanha; a confirmação avisa.
- Exclusão é física e sem desfazer.
- Criar à mão só existe na trilha Grupos; limpar a trilha API deixa a pessoa dependente do chat de refino para repovoar, e o aviso diz isso.
- Peça à mão numa campanha sem âncora nasce sem data e não entra na fila; o `validateSchedulable` reclama na aprovação.
