# Desconectar o número (e trocar quem carrega os grupos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um botão *Desconectar número* na faixa de conexão de `/disparos` que pausa os envios e solta a sessão da Evolution, mais uma trava que impede o *Sincronizar grupos* de desativar a lista inteira quando a Evolution ainda não terminou de carregar as conversas.

**Architecture:** Quatro camadas, de baixo para cima. `evoLogout` no cliente HTTP da Evolution (`DELETE /instance/logout/{instance}`); `assessSyncRisk` como função pura ao lado de `planCommunitySync`, sem rede nem banco, para a regra de risco ser testável; `disconnectNumberAction` e a trava dentro de `syncGroupsAction` na camada de server actions; botão e confirmações no client component da faixa. A ordem pausa-antes-de-logout é requisito, não detalhe.

**Tech Stack:** Next.js 16 (App Router, server actions) + TypeScript + Tailwind v4 + Supabase + Vitest 4. UI em PT-BR.

## Global Constraints

- **Sem migration.** A pausa reusa `app_settings.sends_paused` / `paused_reason`, que já existem.
- **Sem variável de ambiente nova.** `EVOLUTION_INSTANCE` continua a mesma instância antes e depois da troca — o que muda é o celular que lê o QR.
- **Nada é apagado do banco em nenhum caminho.** Grupo no máximo vai de `active: true` para `false`.
- **Ordem obrigatória em `disconnectNumberAction`:** pausa primeiro, logout depois. Nunca o inverso.
- **Nenhuma escrita no banco antes da avaliação de risco** dentro de `syncGroupsAction`.
- **Motivo da pausa, exato:** `"Troca de número"`.
- **Copy PT-BR.** Tokens de cor já existentes no projeto: `text-risk`, `border-risk`, `bg-risk/10`, `bg-emerald`/`bg-emeraldd`, `border-line`, `bg-paper`, `text-muted`, `text-ink`.
- **Imports absolutos com `@/`.** Nunca `../../`.
- Comandos de verificação: `npx tsc --noEmit` e `npm test` (que é `vitest run`).

---

### Task 1: `evoLogout` no cliente da Evolution

Sem teste de unidade: é I/O puro sobre `evoFetch`, e o projeto não testa `client.ts` diretamente (só `config`, `sync` e `url`). A verificação é o typecheck e o uso manual na Task 4.

**Files:**
- Modify: `lib/evolution/client.ts`

**Interfaces:**
- Consumes: `EvolutionConfig` de `@/lib/evolution/types` (já importado no arquivo).
- Produces: `evoLogout(cfg: EvolutionConfig): Promise<void>`

- [ ] **Step 1: Aceitar o verbo DELETE no `evoFetch`**

Em `lib/evolution/client.ts`, na assinatura de `evoFetch`, trocar o tipo de `init.method`:

```ts
  init?: { method?: "GET" | "POST" | "DELETE"; body?: unknown; timeoutMs?: number },
```

O corpo de `evoFetch` não muda — `init?.method ?? "GET"` já cobre.

- [ ] **Step 2: Adicionar `evoLogout` logo depois de `evoConnectionState`**

```ts
/**
 * Solta o número da instância sem destruí-la: mesmo nome, mesmas configurações,
 * mesmo webhook. É o "sair do aparelho conectado" do WhatsApp, disparado por aqui.
 *
 * Depois disso, /instance/connect volta a devolver QR — que é o que permite parear
 * um número diferente. Enquanto a sessão está `open`, ele responde só o estado.
 *
 * A resposta é descartada: o que importa é não ter lançado.
 */
export async function evoLogout(cfg: EvolutionConfig): Promise<void> {
  await evoFetch<unknown>(cfg, `/instance/logout/${cfg.instance}`, { method: "DELETE" });
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add lib/evolution/client.ts
git commit -m "feat: evoLogout solta a sessao da Evolution sem destruir a instancia"
```

---

### Task 2: `assessSyncRisk` — a regra de risco da sincronização

TDD: o teste vem antes. É função pura, sem rede e sem banco.

**Files:**
- Modify: `lib/evolution/sync.ts`
- Test: `lib/evolution/sync.test.ts`

**Interfaces:**
- Consumes: `SyncPlan` e `SyncableCommunity`, ambos já exportados de `@/lib/evolution/sync`.
- Produces:
  - `type SyncRisk = { kind: "ok" } | { kind: "empty"; total: number } | { kind: "mass"; deactivating: number; total: number }`
  - `assessSyncRisk(plan: SyncPlan, existing: SyncableCommunity[], groupCount: number): SyncRisk`

- [ ] **Step 1: Escrever os testes que falham**

Em `lib/evolution/sync.test.ts`, trocar a linha de import do topo por:

```ts
import {
  planCommunitySync,
  uniqueIdentifier,
  assessSyncRisk,
  type SyncableCommunity,
  type SyncPlan,
} from "@/lib/evolution/sync";
```

E acrescentar ao final do arquivo:

```ts
/** N comunidades vinculadas e ativas, com ids c1..cN. */
function linked(n: number): SyncableCommunity[] {
  return Array.from({ length: n }, (_, i) =>
    community({
      id: `c${i + 1}`,
      wa_group_id: `12036300000000000${i + 1}@g.us`,
      wa_subject: `Grupo ${i + 1}`,
    }),
  );
}

function planWith(deactivate: string[]): SyncPlan {
  return { insert: [], update: [], deactivate };
}

describe("assessSyncRisk", () => {
  it("recusa quando a Evolution devolve zero grupos e há grupos vinculados", () => {
    const existing = linked(2);
    expect(assessSyncRisk(planWith(["c1", "c2"]), existing, 0)).toEqual({
      kind: "empty",
      total: 2,
    });
  });

  it("deixa passar a primeira sincronização de todas", () => {
    expect(assessSyncRisk(planWith([]), [], 0)).toEqual({ kind: "ok" });
  });

  it("pede confirmação ao desativar mais da metade", () => {
    const existing = linked(10);
    const plan = planWith(["c1", "c2", "c3", "c4", "c5", "c6"]);
    expect(assessSyncRisk(plan, existing, 4)).toEqual({
      kind: "mass",
      deactivating: 6,
      total: 10,
    });
  });

  it("não pede confirmação ao desativar exatamente metade", () => {
    const existing = linked(10);
    const plan = planWith(["c1", "c2", "c3", "c4", "c5"]);
    expect(assessSyncRisk(plan, existing, 5)).toEqual({ kind: "ok" });
  });

  it("não reclama de sincronização sem desativação", () => {
    expect(assessSyncRisk(planWith([]), linked(3), 3)).toEqual({ kind: "ok" });
  });

  it("ignora comunidades já inativas na contagem", () => {
    const existing = [
      community({ id: "c1", wa_group_id: "120363000000000001@g.us" }),
      community({ id: "c2", wa_group_id: "120363000000000002@g.us", active: false }),
      community({ id: "c3", wa_group_id: "120363000000000003@g.us", active: false }),
    ];
    // Só c1 entra no total; desativar c1 é 1 de 1, ou seja, mais da metade.
    expect(assessSyncRisk(planWith(["c1"]), existing, 5)).toEqual({
      kind: "mass",
      deactivating: 1,
      total: 1,
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/evolution/sync.test.ts`
Expected: FAIL — `assessSyncRisk is not a function` (ou erro de import do TypeScript). Os testes de `uniqueIdentifier` e `planCommunitySync` continuam passando.

- [ ] **Step 3: Implementar**

Em `lib/evolution/sync.ts`, acrescentar ao final do arquivo:

```ts
export type SyncRisk =
  | { kind: "ok" }
  | { kind: "empty"; total: number }
  | { kind: "mass"; deactivating: number; total: number };

/**
 * Aplicar este plano é seguro?
 *
 * Existe porque `planCommunitySync` trata "grupo ausente da lista" como "grupo sumiu".
 * Logo depois de parear um número, a Evolution ainda está carregando os chats e
 * /chat/findChats responde vazio ou pela metade — sincronizar nessa janela desativaria
 * a lista inteira. Recuperável sincronizando de novo, mas no intervalo não há destino
 * para montar campanha.
 *
 * `total` conta só o que está vinculado E ativo: é o universo que pode ser perdido.
 * Comunidade sem JID nunca foi sincronizada, e comunidade já inativa não tem o que
 * perder.
 */
export function assessSyncRisk(
  plan: SyncPlan,
  existing: SyncableCommunity[],
  groupCount: number,
): SyncRisk {
  const total = existing.filter((c) => c.wa_group_id && c.active).length;

  if (groupCount === 0 && total > 0) return { kind: "empty", total };

  // Estritamente mais da metade: 6 de 10 pergunta, 5 de 10 não.
  if (plan.deactivate.length * 2 > total) {
    return { kind: "mass", deactivating: plan.deactivate.length, total };
  }

  return { kind: "ok" };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/evolution/sync.test.ts`
Expected: PASS, incluindo os testes que já existiam no arquivo.

- [ ] **Step 5: Commit**

```bash
git add lib/evolution/sync.ts lib/evolution/sync.test.ts
git commit -m "feat: assessSyncRisk protege a lista de grupos de sync prematuro"
```

---

### Task 3: Server actions e o botão na faixa de conexão

Actions e tela na mesma tarefa **de propósito**: transformar `SyncResult` numa união quebra o typecheck de quem a consome, e só a tela fecha. Separar deixaria a árvore sem compilar entre duas tarefas. Um único commit ao final, com os dois arquivos, para nenhum commit da história ficar sem compilar.

Sem teste de unidade: são server actions batendo em Supabase e na Evolution, mais um client component. A regra de risco já está coberta pela Task 2; aqui só se liga o fio. Verificação por typecheck + suíte + o roteiro manual no fim deste plano.

**Files:**
- Modify: `app/(app)/disparos/actions.ts`
- Modify: `app/(app)/disparos/_components/connection-strip.tsx`

**Interfaces:**
- Consumes: `evoLogout` (Task 1), `assessSyncRisk` e `SyncRisk` (Task 2), mais `getEvolutionConfig`, `evoConnectionState`, `evoListGroups`, `planCommunitySync`, `createServerSupabase`, `setPauseAction` — todos já importados em `actions.ts`.
- Produces (ponta da cadeia — nada depende disto):
  - `disconnectNumberAction(): Promise<{ state: EvoConnectionState }>`
  - `SyncResult` passa a ser união: `{ ok: true; inserted: number; linked: number; deactivated: number } | { ok: false; needsConfirm: true; deactivating: number; total: number }`
  - `syncGroupsAction(confirmed?: boolean): Promise<SyncResult>`

- [ ] **Step 1: Atualizar os imports**

Em `app/(app)/disparos/actions.ts`, trocar as duas linhas de import da Evolution por:

```ts
import { evoConnect, evoConnectionState, evoListGroups, evoLogout } from "@/lib/evolution/client";
import { assessSyncRisk, planCommunitySync, type SyncableCommunity } from "@/lib/evolution/sync";
```

- [ ] **Step 2: Adicionar `disconnectNumberAction` logo depois de `refreshStateAction`**

```ts
/**
 * Solta o número e deixa a fila parada.
 *
 * A pausa vem ANTES do logout de propósito. Se o logout falhar, o sistema fica pausado
 * e conectado — chato, e um clique conserta. Na ordem inversa, uma falha ao pausar
 * deixaria a fila tentando entregar com o número fora do ar, queimando as 3 tentativas
 * de cada linha (1, 3 e 9 min) até virar falha definitiva.
 *
 * Retomar é sempre manual: a fila não volta a andar antes de alguém conferir que os
 * grupos sincronizaram certo com o número novo.
 */
export async function disconnectNumberAction(): Promise<{ state: EvoConnectionState }> {
  const cfg = getEvolutionConfig(process.env);

  await setPauseAction(true, "Troca de número");
  await evoLogout(cfg);

  revalidateAll();
  return { state: await evoConnectionState(cfg) };
}
```

`setPauseAction` está declarada mais abaixo no arquivo; hoisting de `function` cobre, e ela é `async function` exportada — nada a fazer.

- [ ] **Step 3: Trocar o tipo `SyncResult`**

Substituir a linha:

```ts
export type SyncResult = { inserted: number; linked: number; deactivated: number };
```

por:

```ts
export type SyncResult =
  | { ok: true; inserted: number; linked: number; deactivated: number }
  | { ok: false; needsConfirm: true; deactivating: number; total: number };
```

- [ ] **Step 4: Aplicar a trava dentro de `syncGroupsAction`**

Substituir o corpo inteiro de `syncGroupsAction` por:

```ts
export async function syncGroupsAction(confirmed: boolean = false): Promise<SyncResult> {
  const groups = await evoListGroups(getEvolutionConfig(process.env));

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("communities")
    .select("id, name, identifier, wa_group_id, wa_subject, active");
  if (error) throw new Error(`Falha ao carregar comunidades: ${error.message}`);

  const existing = (data ?? []) as SyncableCommunity[];
  const plan = planCommunitySync(existing, groups);

  // Nenhuma escrita acontece antes desta avaliação.
  const risk = assessSyncRisk(plan, existing, groups.length);

  if (risk.kind === "empty") {
    throw new Error(
      `A Evolution devolveu zero grupos, mas há ${risk.total} grupo(s) cadastrado(s). ` +
        "Ela provavelmente ainda está carregando as conversas depois do pareamento — " +
        "espere um minuto e sincronize de novo.",
    );
  }

  if (risk.kind === "mass" && !confirmed) {
    return {
      ok: false,
      needsConfirm: true,
      deactivating: risk.deactivating,
      total: risk.total,
    };
  }

  const syncedAt = new Date().toISOString();

  if (plan.insert.length) {
    const rows = plan.insert.map((row) => ({ ...row, sort_order: 99, synced_at: syncedAt }));
    const { error: e } = await supabase.from("communities").insert(rows);
    if (e) throw new Error(`Falha ao inserir grupos: ${e.message}`);
  }

  for (const row of plan.update) {
    const { id, ...fields } = row;
    const { error: e } = await supabase
      .from("communities")
      .update({ ...fields, synced_at: syncedAt })
      .eq("id", id);
    if (e) throw new Error(`Falha ao atualizar grupo: ${e.message}`);
  }

  if (plan.deactivate.length) {
    const { error: e } = await supabase
      .from("communities")
      .update({ active: false, synced_at: syncedAt })
      .in("id", plan.deactivate);
    if (e) throw new Error(`Falha ao desativar grupos: ${e.message}`);
  }

  revalidateAll();
  return {
    ok: true,
    inserted: plan.insert.length,
    linked: plan.update.length,
    deactivated: plan.deactivate.length,
  };
}
```

Neste ponto o `tsc` está vermelho de propósito: `setSync` ainda recebe a união e `sync.inserted` não existe na variante `ok: false`. Os passos seguintes fecham. **Não commite ainda.**

- [ ] **Step 5: Importar a nova action na faixa de conexão**

Trocar o bloco de import de `../actions` por:

```ts
import {
  fetchQrCodeAction,
  refreshStateAction,
  syncGroupsAction,
  setPauseAction,
  disconnectNumberAction,
  type SyncResult,
} from "../actions";
```

- [ ] **Step 6: Estreitar o estado `sync` para a variante de sucesso**

Trocar a linha:

```tsx
  const [sync, setSync] = useState<SyncResult | null>(null);
```

por:

```tsx
  // Só a variante de sucesso vira estado: a de confirmação é tratada na hora, não exibida.
  const [sync, setSync] = useState<Extract<SyncResult, { ok: true }> | null>(null);
```

- [ ] **Step 7: Adicionar `runSync` e `disconnect` logo depois de `togglePause`**

```tsx
  /**
   * Sincroniza, e se a resposta pedir confirmação (desativaria mais da metade dos
   * grupos), pergunta e repete com `confirmed = true`. Transição própria em vez de
   * reusar `run`, para não aninhar startTransition.
   */
  function runSync(confirmed: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await syncGroupsAction(confirmed);
        if (result.ok) {
          setSync(result);
          router.refresh();
          return;
        }
        const go = confirm(
          `Isso vai desativar ${result.deactivating} dos ${result.total} grupos sincronizados.\n\n` +
            "Se você não saiu desses grupos de propósito, a Evolution pode ainda estar " +
            "carregando as conversas do número recém-pareado.\n\nContinuar mesmo assim?",
        );
        if (go) runSync(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Algo deu errado.");
      }
    });
  }

  function disconnect() {
    const go = confirm(
      "Desconectar o número?\n\n" +
        "• Os envios ficam pausados na hora — nada sai até você retomar.\n" +
        "• A lista de grupos é preservada; nada é apagado.\n" +
        "• Para trocar de número: leia o novo QR com o celular novo, sincronize os grupos e retome os envios.",
    );
    if (!go) return;
    run(disconnectNumberAction, () => {
      setQr(null);
      setSync(null);
    });
  }
```

- [ ] **Step 8: Ligar o botão de sincronizar no `runSync`**

Trocar o `onClick` do botão *Sincronizar grupos*:

```tsx
                  onClick={() => runSync(false)}
```

(era `onClick={() => run(syncGroupsAction, setSync)}`)

- [ ] **Step 9: Adicionar o botão de desconectar**

Logo depois do botão *Conectar número* / *Gerar novo QR* e antes do *Sincronizar grupos*:

```tsx
                {(state === "open" || state === "connecting") && (
                  <button
                    onClick={disconnect}
                    disabled={pending}
                    title="Solta a sessão da Evolution e pausa os envios"
                    className="rounded-lg border border-risk px-3 py-1.5 text-xs font-semibold text-risk transition hover:bg-risk/10 disabled:opacity-50"
                  >
                    Desconectar número
                  </button>
                )}
```

Aparece também em `"connecting"` de propósito: soltar a sessão é o conserto de uma instância travada nesse estado.

- [ ] **Step 10: Verificar typecheck e suíte**

Run: `npx tsc --noEmit`
Expected: sem erros — o vermelho do Step 5 desapareceu.

Run: `npm test`
Expected: toda a suíte verde (224 testes de baseline + os 6 da Task 2).

- [ ] **Step 11: Commit único, com os dois arquivos**

```bash
git add "app/(app)/disparos/actions.ts" "app/(app)/disparos/_components/connection-strip.tsx"
git commit -m "feat: botao de desconectar numero e trava de risco no sincronizar"
```

---

## Verificação manual (depois da Task 3)

Rodar `npm run dev` e abrir `/disparos`, gaveta *gerenciar* aberta.

- [ ] **O caminho da troca.** Com o número conectado: *Desconectar número* → confirmar → a faixa fica vermelha com "Envios pausados" e o motivo *Troca de número*, e o estado vai para **Desconectado** → *Conectar número* mostra o QR → parear com o celular novo → a tela vira **Conectado** sozinha → *Sincronizar grupos* → como os JIDs são globais e o número novo está nos mesmos grupos, o resultado esperado é `0 novo(s) · 0 atualizado(s) · 0 sumiram`, e a contagem de "grupos em uso" continua idêntica à de antes → *Retomar envios*.
- [ ] **A trava.** Sincronizar imediatamente após o pareamento, antes de a Evolution carregar os chats, deve **recusar** com a mensagem de "ainda está carregando as conversas" — e a contagem de grupos em uso não pode mudar.
- [ ] **A instância travada.** Com o estado em *Conectando*, o botão de desconectar deve aparecer e soltar a sessão.

## Riscos conhecidos (do spec, não são bugs a corrigir aqui)

- Logout numa instância já desconectada pode voltar erro da Evolution; o botão só aparece com estado `open`/`connecting`, e numa corrida a mensagem crua aparece na faixa e o refresh mostra o estado real.
- Envios que vencerem entre o clique e a gravação da pausa ainda podem ser reivindicados pelo worker (janela de milissegundos). O retry de 3 tentativas cobre; não vale transação distribuída.
- A trava da metade pede confirmação também quando a saída dos grupos foi de verdade. É uma confirmação, não um bloqueio.
