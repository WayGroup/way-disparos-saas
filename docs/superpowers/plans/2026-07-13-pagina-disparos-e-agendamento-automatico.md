# Página única de Disparos + agendamento automático — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fundir `/whatsapp`, `/envios` e `/disparo-rapido` numa página `/disparos`, e fazer a campanha montar sua própria fila de envios já na geração — travada até a aprovação.

**Arquitetura:** O gate de aprovação já vive no worker (`claim_scheduled_sends` só entrega envios de campanha `aprovada`). Logo, agendar na geração não dispara nada: basta não mexer no status. A seleção de grupos passa a ser feita no formulário de nova campanha e é **copiada** para cada peça — a peça segue sendo a única fonte de verdade, sem herança. Toda mutação numa peça de grupo replaneja a fila (apaga os `pendente`, remonta), então a fila nunca fica velha em relação ao conteúdo.

**Stack:** Next.js 16 App Router, Supabase (SQL puro), Tailwind v4, Vitest. Sem schema novo.

## Global Constraints

- UI em PT-BR. TypeScript sempre. Imports absolutos com `@/`.
- Nenhuma migration nova. O modelo atual (`campaign_group_post_communities`, `scheduled_sends`, `communities.enabled`) já basta.
- Replanejar é **tolerante** (peça sem grupo não gera linha). Aprovar é **rigoroso** (qualquer peça inagendável bloqueia tudo).
- Replanejar nunca toca em envio `enviado`, `enviando`, `falhou` ou `cancelado` — só apaga `pendente`.
- Testes Vitest só em funções puras, ao lado do código em `lib/`. Evolution nunca é chamada em teste.
- Rodar `npm test` e `npx tsc --noEmit` ao fim de cada task.

---

### Task 1: Replanejamento automático da fila

Extrai o miolo de `approveAndScheduleAction` numa função reutilizável e chama-a de toda mutação de peça de grupo.

**Files:**
- Modify: `app/(app)/campanhas/actions.ts`
- Create: `lib/sends/reschedule.ts`
- Test: `lib/sends/reschedule.test.ts`

**Interfaces:**
- Consumes: `planSends`, `validateSchedulable` (`lib/sends/plan.ts`), `buildSendPayload` (`lib/sends/payload.ts`), `buildGroupPieces` (já em `campanhas/actions.ts`).
- Produces: `partitionSchedulable(pieces)` (puro) e `rescheduleCampaignAction(campaignId)` (server action).

- [ ] **Step 1: Escrever o teste da função pura**

```ts
// lib/sends/reschedule.test.ts
import { describe, it, expect } from "vitest";
import { partitionSchedulable } from "@/lib/sends/reschedule";
import type { PlanPiece } from "@/lib/sends/plan";

const alvo = { community_id: "c1", wa_group_id: "1@g.us", wa_subject: "G1" };
const base = (over: Partial<PlanPiece & { label: string }> = {}) => ({
  post_id: "p1", label: "Convite", send_at: "2026-07-20 10:00",
  payload: { text: "oi", media: null }, targets: [alvo], ...over,
});

describe("partitionSchedulable", () => {
  it("separa o que dá para agendar do que não dá", () => {
    const ok = base({ post_id: "p1" });
    const semGrupo = base({ post_id: "p2", targets: [] });
    const { schedulable, blocked } = partitionSchedulable([ok, semGrupo]);
    expect(schedulable.map((p) => p.post_id)).toEqual(["p1"]);
    expect(blocked.map((i) => i.post_id)).toEqual(["p2"]);
  });

  it("tudo válido não bloqueia nada", () => {
    const { schedulable, blocked } = partitionSchedulable([base()]);
    expect(schedulable).toHaveLength(1);
    expect(blocked).toEqual([]);
  });

  it("peça sem texto e sem mídia é bloqueada", () => {
    const { schedulable, blocked } = partitionSchedulable([
      base({ payload: { text: "", media: null } }),
    ]);
    expect(schedulable).toEqual([]);
    expect(blocked[0].message).toMatch(/sem texto e sem mídia/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

`npx vitest run lib/sends/reschedule.test.ts` → FAIL: `Cannot find module '@/lib/sends/reschedule'`

- [ ] **Step 3: Implementar `lib/sends/reschedule.ts`**

```ts
import { validateSchedulable, type PlanPiece, type ScheduleIssue } from "@/lib/sends/plan";

export type LabeledPiece = PlanPiece & { label: string };

/**
 * Replanejar é tolerante: uma peça inagendável simplesmente não vira linha de fila,
 * em vez de derrubar o replanejamento inteiro. Quem é rigoroso é a aprovação.
 */
export function partitionSchedulable(pieces: LabeledPiece[]): {
  schedulable: LabeledPiece[];
  blocked: ScheduleIssue[];
} {
  const blocked = validateSchedulable(pieces);
  const bad = new Set(blocked.map((i) => i.post_id));
  return { schedulable: pieces.filter((p) => !bad.has(p.post_id)), blocked };
}
```

- [ ] **Step 4: Rodar e ver passar**

`npx vitest run lib/sends/reschedule.test.ts` → PASS (3 testes)

- [ ] **Step 5: Adicionar `rescheduleCampaign` em `app/(app)/campanhas/actions.ts`**

Logo abaixo de `buildGroupPieces`:

```ts
/**
 * Remonta a fila da campanha a partir do conteúdo atual das peças.
 *
 * A fila guarda um snapshot do texto e da mídia; sem isto, editar a peça deixaria
 * a fila velha. Só apaga os `pendente` — o que já saiu ou está saindo é intocável.
 *
 * Não mexe no status da campanha: rascunho continua rascunho, e o worker (que só
 * entrega campanha aprovada) segue segurando a fila.
 */
async function rescheduleCampaign(campaignId: string): Promise<number> {
  const { pieces } = await buildGroupPieces(campaignId);
  const { schedulable } = partitionSchedulable(pieces);

  const supabase = await createServerSupabase();
  const { error: eDel } = await supabase
    .from("scheduled_sends")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("status", "pendente");
  if (eDel) throw new Error(`Falha ao limpar a fila: ${eDel.message}`);

  const planned = planSends(schedulable);
  if (planned.length > 0) {
    const batchId = crypto.randomUUID();
    const rows = planned.map((s) => ({ ...s, batch_id: batchId, campaign_id: campaignId }));
    const { error } = await supabase.from("scheduled_sends").insert(rows);
    if (error) throw new Error(`Falha ao agendar envios: ${error.message}`);
  }

  revalidatePath(`/campanhas/${campaignId}`);
  revalidatePath("/disparos");
  return planned.length;
}

export async function rescheduleCampaignAction(campaignId: string): Promise<number> {
  return rescheduleCampaign(campaignId);
}
```

Import no topo: `import { partitionSchedulable } from "@/lib/sends/reschedule";`

- [ ] **Step 6: Chamar `rescheduleCampaign` de toda mutação de peça de grupo**

Ao fim de cada uma destas funções em `app/(app)/campanhas/actions.ts`, antes do `revalidatePath`:
`updateGroupPostAction`, `setPostAssetAction`, `setPostCommunitiesAction`, `refineCampaignAction`.

```ts
await rescheduleCampaign(campaignId);
```

- [ ] **Step 7: Simplificar `approveAndScheduleAction`**

Aprovar deixa de montar a fila. Passa a: validar rigorosamente → replanejar → destravar.

```ts
export async function approveAndScheduleAction(id: string): Promise<ScheduleResult> {
  const { pieces } = await buildGroupPieces(id);

  const issues = validateSchedulable(pieces);
  if (issues.length > 0) return { ok: false, issues };

  const scheduled = await rescheduleCampaign(id);

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: "aprovada", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Falha ao aprovar campanha: ${error.message}`);

  revalidatePath("/campanhas");
  revalidatePath(`/campanhas/${id}`);
  revalidatePath("/disparos");
  return { ok: true, scheduled };
}
```

- [ ] **Step 8: Verificar**

`npx tsc --noEmit` → sem saída. `npm test` → todos passam.

- [ ] **Step 9: Commit**

```bash
git add lib/sends/reschedule.ts lib/sends/reschedule.test.ts "app/(app)/campanhas/actions.ts"
git commit -m "feat: fila da campanha se replaneja a cada edicao de peca"
```

---

### Task 2: Grupos escolhidos na criação da campanha

O formulário de nova campanha ganha o seletor; a geração copia a seleção para cada peça e já monta a fila.

**Files:**
- Modify: `app/(app)/campanhas/nova/page.tsx`
- Modify: `app/(app)/campanhas/nova/_components/new-campaign-form.tsx`
- Modify: `app/(app)/campanhas/actions.ts` (`generateCampaignAction`)
- Create: `app/(app)/campanhas/_components/group-chips.tsx` (seletor com busca, reusável)

**Interfaces:**
- Consumes: `listActiveGroups()` (`lib/db/communities.ts`).
- Produces: `<GroupChips groups value onChange />`; `generateCampaignAction(recipeId, name, inputs, communityIds)`.

- [ ] **Step 1: Criar o seletor reusável `app/(app)/campanhas/_components/group-chips.tsx`**

Componente client controlado: recebe `groups: Community[]`, `value: string[]`, `onChange(ids)`. Campo de busca (obrigatório: contas reais têm 200+ grupos), chips clicáveis, os selecionados sempre visíveis mesmo fora do filtro. É a extração do que hoje está duplicado em `group-multi-select.tsx` e `quick-send-form.tsx`.

- [ ] **Step 2: Passar os grupos para o formulário**

`app/(app)/campanhas/nova/page.tsx`: incluir `listActiveGroups()` no `Promise.all` e passar `groups` para `<NewCampaignForm>`.

- [ ] **Step 3: Adicionar o seletor ao formulário**

Em `new-campaign-form.tsx`, dentro do card da receita, abaixo dos inputs:

```tsx
<div>
  <span className="text-xs font-mono uppercase tracking-wide text-muted">
    Grupos do disparo {communityIds.length > 0 && `· ${communityIds.length} selecionado(s)`}
  </span>
  <GroupChips groups={groups} value={communityIds} onChange={setCommunityIds} />
  {groups.length === 0 && (
    <p className="mt-1 text-xs text-risk">
      Nenhum grupo habilitado. Escolha os grupos em <a href="/disparos" className="underline">Disparos</a>.
    </p>
  )}
</div>
```

E `generate()` passa `communityIds` para a action. Botão desabilitado se `communityIds.length === 0`.

- [ ] **Step 4: `generateCampaignAction` copia os grupos e agenda**

Assinatura: `generateCampaignAction(recipeId, name, inputs, communityIds: string[])`.

Depois do insert dos `campaign_group_posts` (usar `.select("id")` para ter os ids), dentro do mesmo `try` do rollback:

```ts
if (communityIds.length > 0 && newPosts.length > 0) {
  const links = newPosts.flatMap((p) =>
    communityIds.map((community_id) => ({ post_id: p.id as string, community_id })),
  );
  const { error: e3 } = await supabase.from("campaign_group_post_communities").insert(links);
  if (e3) throw new Error(`Falha ao vincular grupos: ${e3.message}`);
}
```

E, após o `try` (fila é acessório — se falhar, a campanha não é destruída):

```ts
// A fila nasce montada e travada: o worker só entrega campanha aprovada.
try {
  await rescheduleCampaign(campaignId);
} catch (e) {
  console.error(`Campanha ${campaignId} gerada, mas a fila não foi montada:`, e);
}
```

- [ ] **Step 5: Verificar**

`npx tsc --noEmit` → limpo. `npm test` → passa. No app: criar campanha escolhendo 2 grupos → abrir `/disparos` → os envios já aparecem, com selo "aguardando aprovação" (Task 5).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/campanhas"
git commit -m "feat: grupos escolhidos na criacao da campanha; fila nasce montada"
```

---

### Task 3: Editor em massa de grupos no cabeçalho da campanha

**Files:**
- Modify: `app/(app)/campanhas/[id]/_components/campaign-view.tsx`
- Create: `app/(app)/campanhas/[id]/_components/campaign-groups-bar.tsx`
- Modify: `app/(app)/campanhas/actions.ts` (`setCampaignCommunitiesAction`)
- Create: `lib/sends/group-consensus.ts` + teste

**Interfaces:**
- Produces: `groupConsensus(posts)` → `{ uniform: true; ids: string[] } | { uniform: false; customized: number }`; `setCampaignCommunitiesAction(campaignId, communityIds)`.

- [ ] **Step 1: Teste de `groupConsensus`**

```ts
// lib/sends/group-consensus.test.ts
import { describe, it, expect } from "vitest";
import { groupConsensus } from "@/lib/sends/group-consensus";

describe("groupConsensus", () => {
  it("todas as peças com os mesmos grupos → uniforme", () => {
    expect(groupConsensus([{ community_ids: ["a", "b"] }, { community_ids: ["b", "a"] }]))
      .toEqual({ uniform: true, ids: ["a", "b"] });
  });

  it("peças divergentes → não uniforme, com a contagem das que fogem do padrão", () => {
    const r = groupConsensus([
      { community_ids: ["a"] }, { community_ids: ["a"] }, { community_ids: ["b"] },
    ]);
    expect(r).toEqual({ uniform: false, customized: 1 });
  });

  it("sem peças → uniforme e vazio", () => {
    expect(groupConsensus([])).toEqual({ uniform: true, ids: [] });
  });
});
```

- [ ] **Step 2: Rodar e falhar** → `npx vitest run lib/sends/group-consensus.test.ts`

- [ ] **Step 3: Implementar `lib/sends/group-consensus.ts`**

```ts
export type ConsensusResult =
  | { uniform: true; ids: string[] }
  | { uniform: false; customized: number };

const key = (ids: string[]) => [...ids].sort().join("|");

/**
 * O cabeçalho da campanha só pode exibir "os grupos da campanha" se todas as peças
 * concordarem. Se divergirem, ele diz isso em vez de mentir mostrando uma delas.
 */
export function groupConsensus(posts: { community_ids: string[] }[]): ConsensusResult {
  if (posts.length === 0) return { uniform: true, ids: [] };

  const counts = new Map<string, number>();
  for (const p of posts) counts.set(key(p.community_ids), (counts.get(key(p.community_ids)) ?? 0) + 1);

  if (counts.size === 1) return { uniform: true, ids: [...posts[0].community_ids].sort() };

  const majority = Math.max(...counts.values());
  return { uniform: false, customized: posts.length - majority };
}
```

- [ ] **Step 4: Rodar e passar** (3 testes)

- [ ] **Step 5: `setCampaignCommunitiesAction` em `app/(app)/campanhas/actions.ts`**

```ts
/**
 * Editor em massa: sobrescreve os grupos de TODAS as peças da campanha.
 * Não existe "grupo da campanha" persistido — a peça é a fonte de verdade.
 */
export async function setCampaignCommunitiesAction(
  campaignId: string,
  communityIds: string[],
): Promise<void> {
  const supabase = await createServerSupabase();
  const { data: posts, error } = await supabase
    .from("campaign_group_posts").select("id").eq("campaign_id", campaignId);
  if (error) throw new Error(`Falha ao carregar posts: ${error.message}`);

  const ids = (posts ?? []).map((p) => p.id as string);
  if (ids.length === 0) return;

  const { error: eDel } = await supabase
    .from("campaign_group_post_communities").delete().in("post_id", ids);
  if (eDel) throw new Error(`Falha ao limpar grupos: ${eDel.message}`);

  if (communityIds.length > 0) {
    const rows = ids.flatMap((post_id) => communityIds.map((community_id) => ({ post_id, community_id })));
    const { error: eIns } = await supabase.from("campaign_group_post_communities").insert(rows);
    if (eIns) throw new Error(`Falha ao aplicar grupos: ${eIns.message}`);
  }

  await rescheduleCampaign(campaignId);
  revalidatePath(`/campanhas/${campaignId}`);
}
```

- [ ] **Step 6: `campaign-groups-bar.tsx`**

Client. Recebe `campaignId`, `posts` e `groups`. Usa `groupConsensus`:
- uniforme → mostra os chips e um botão "editar";
- divergente → "os grupos variam por peça (N customizadas)" + botão "unificar".

Ao salvar, `confirm("Aplicar estes grupos às N peças? Isso sobrescreve alvos customizados.")` e chama `setCampaignCommunitiesAction`. Reusa `<GroupChips>` da Task 2.

- [ ] **Step 7: Montar a barra no `campaign-view.tsx`**, abaixo do header, visível só quando `track === "grupos"`.

- [ ] **Step 8: Verificar** — `npx tsc --noEmit`, `npm test`.

- [ ] **Step 9: Commit**

```bash
git add lib/sends/group-consensus.ts lib/sends/group-consensus.test.ts "app/(app)/campanhas"
git commit -m "feat: editor em massa dos grupos da campanha"
```

---

### Task 4: A página `/disparos`

Funde as três telas. **Usar a skill `frontend-design`** antes de escrever a UI.

**Files:**
- Create: `app/(app)/disparos/page.tsx`, `actions.ts`
- Create: `app/(app)/disparos/_components/connection-strip.tsx`, `queue-table.tsx`, `quick-send-panel.tsx`
- Move: o conteúdo de `whatsapp/_components/{connection-panel,group-picker}.tsx` para dentro da gaveta da faixa
- Modify: `lib/nav.ts`, `lib/nav.test.ts`
- Delete: `app/(app)/whatsapp/`, `app/(app)/envios/`, `app/(app)/disparo-rapido/`

**Interfaces:**
- Consumes: `listSends`, `countSendsByStatus`, `getAppSettings` (`lib/db/sends.ts`), `listSyncedGroups`, `listActiveGroups` (`lib/db/communities.ts`), todas as actions já existentes das três telas (movidas para `disparos/actions.ts`).

- [ ] **Step 1: Ler a skill `frontend-design`.**

- [ ] **Step 2: Consolidar as actions** — mover o conteúdo de `whatsapp/actions.ts`, `envios/actions.ts` e `disparo-rapido/actions.ts` para `app/(app)/disparos/actions.ts`, sem mudar assinaturas.

- [ ] **Step 3: `connection-strip.tsx`** — faixa fina: bolinha de estado, número, "N de M grupos em uso", botão de pânico. `▾ gerenciar` expande (estado local) para QR, sincronizar e o seletor de grupos.

- [ ] **Step 4: `queue-table.tsx`** — o corpo. É `envios/_components/sends-table.tsx` movida, mais o selo da Task 5.

- [ ] **Step 5: `quick-send-panel.tsx`** — painel lateral (`fixed inset-y-0 right-0`), fecha com Esc e no backdrop, como `piece-detail-modal.tsx` já faz. Conteúdo = `quick-send-form.tsx` movido, usando `<GroupChips>` da Task 2.

- [ ] **Step 6: `page.tsx`** — Server Component: carrega tudo em `Promise.all`, monta faixa + fila, com o painel controlado por estado no client.

- [ ] **Step 7: Nav** — em `lib/nav.ts`, trocar os três itens por `{ href: "/disparos", label: "Disparos" }`. Atualizar `lib/nav.test.ts`.

- [ ] **Step 8: Apagar as três rotas antigas.**

- [ ] **Step 9: Verificar** — `npm run build` (todas as rotas compilam, as três antigas sumiram), `npm test`, e abrir `/disparos` no dev server.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: pagina unica /disparos (conexao + fila + disparo rapido)"
```

---

### Task 5: Selo "aguardando aprovação"

Com a fila nascendo cheia, envios `pendente` de campanha em rascunho **não vão sair**. Chamá-los de "pendente" é mentira.

**Files:**
- Modify: `lib/db/sends.ts` (`SendWithContext` ganha `campaign_status`)
- Create: `lib/sends/status.ts` + teste
- Modify: `app/(app)/disparos/_components/queue-table.tsx`

**Interfaces:**
- Produces: `displayStatus(send)` → `SendStatus | "aguardando"`.

- [ ] **Step 1: Teste**

```ts
// lib/sends/status.test.ts
import { describe, it, expect } from "vitest";
import { displayStatus } from "@/lib/sends/status";

describe("displayStatus", () => {
  it("pendente de campanha em rascunho está travado, não pendente", () => {
    expect(displayStatus({ status: "pendente", campaign_status: "rascunho" })).toBe("aguardando");
  });
  it("pendente de campanha aprovada é pendente de verdade", () => {
    expect(displayStatus({ status: "pendente", campaign_status: "aprovada" })).toBe("pendente");
  });
  it("avulso (sem campanha) é pendente de verdade", () => {
    expect(displayStatus({ status: "pendente", campaign_status: null })).toBe("pendente");
  });
  it("os demais status passam direto", () => {
    expect(displayStatus({ status: "enviado", campaign_status: "rascunho" })).toBe("enviado");
    expect(displayStatus({ status: "falhou", campaign_status: null })).toBe("falhou");
  });
});
```

- [ ] **Step 2: Rodar e falhar.**

- [ ] **Step 3: Implementar `lib/sends/status.ts`**

```ts
import type { SendStatus } from "@/lib/db/types";

export type DisplayStatus = SendStatus | "aguardando";

/**
 * O worker só entrega envio de campanha aprovada. Um `pendente` de campanha em
 * rascunho, portanto, não vai sair — mostrá-lo como "pendente" mentiria para quem
 * está olhando a fila. Envio avulso não tem campanha e sempre é elegível.
 */
export function displayStatus(send: {
  status: SendStatus;
  campaign_status: string | null;
}): DisplayStatus {
  if (send.status === "pendente" && send.campaign_status === "rascunho") return "aguardando";
  return send.status;
}
```

- [ ] **Step 4: Rodar e passar** (4 testes).

- [ ] **Step 5: Trazer `campaign_status` na query**

Em `lib/db/sends.ts`, o select de `listSends` já faz join com `campaigns(name)` — trocar por `campaigns(name, status)` e mapear `campaign_status`. Fazer o mesmo em `countSendsByStatus`, que passa a contar por `displayStatus` (senão os contadores mentem também).

- [ ] **Step 6: UI** — `queue-table.tsx` usa `displayStatus`; novo estilo para `aguardando` (cinza, não âmbar), e o texto do filtro ganha a opção. Envio `aguardando` não oferece "cancelar" — o jeito de cancelar é não aprovar a campanha.

- [ ] **Step 7: Verificar** — `npm test`, `npx tsc --noEmit`, e conferir na tela: campanha em rascunho aparece como "aguardando aprovação"; aprovar muda o selo para "pendente".

- [ ] **Step 8: Commit**

```bash
git add lib/sends/status.ts lib/sends/status.test.ts lib/db/sends.ts "app/(app)/disparos"
git commit -m "feat: selo 'aguardando aprovacao' para fila de campanha em rascunho"
```

---

## Verificação end-to-end

1. Criar campanha escolhendo 2 grupos → sem clicar em nada, abrir `/disparos`: os envios já estão lá, com selo **aguardando aprovação**, nas datas e horas de cada peça, espaçados 20–60s entre grupos.
2. Editar a copy de uma peça → voltar a `/disparos`: o texto da fila acompanhou (o snapshot foi refeito).
3. Trocar os grupos pelo cabeçalho da campanha → confirmar "aplicar às N peças" → a fila reflete os grupos novos.
4. Customizar uma peça sozinha → o cabeçalho passa a dizer "os grupos variam por peça".
5. Aprovar → os selos viram **pendente**. `select status, count(*) from scheduled_sends group by 1` bate com a tela.
6. Desaprovar não existe: o caminho de volta é o botão de pânico ou cancelar envio a envio.
7. `/disparos`: pausar tudo → o worker devolve `claimed: 0` no próximo tick.
