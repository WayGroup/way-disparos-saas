# Desconectar reseta a instância — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Desconectar" passa a deletar+recriar a instância Evolution, zerando o histórico de chats — assim, ao trocar de número e sincronizar, só os grupos do número novo aparecem.

**Architecture:** Duas funções novas no cliente Evolution (`evoDeleteInstance`, `evoCreateInstance`), idempotentes via um `tolerateStatuses` no `evoFetch`. A ação `disconnectNumberAction` troca o `logout` por logout-best-effort → delete → create, e mantém a desativação dos grupos. A confirmação da UI passa a avisar que reseta e zera a lista.

**Tech Stack:** Next.js (App Router, server actions) + TypeScript + Vitest + Evolution API (self-hosted, v2.3.7). PT-BR.

## Global Constraints

- **Sem migration; sem webhook** (a instância é criada com payload mínimo `{instanceName, integration:"WHATSAPP-BAILEYS", qrcode:true}`; o app não usa webhook).
- **delete/create idempotentes** (retry-safe): delete tolera 404, create tolera 403/409.
- **Grupos são desativados, não apagados** (`active=false`) — histórico de `scheduled_sends` intacto.
- **Não tocar** no fluxo de conectar (QR), no sincronizar, nem em campanhas/fila/receitas.
- **Copy PT-BR.**
- **Node vem do nvm:** se `node`/`npx` não existirem, rode antes `export NVM_DIR="$HOME/.nvm"; \. "$NVM_DIR/nvm.sh"`.

---

### Task 1: Cliente Evolution — delete + create idempotentes

**Files:**
- Modify: `lib/evolution/client.ts`

**Interfaces:**
- Produces:
  - `evoDeleteInstance(cfg: EvolutionConfig): Promise<void>`
  - `evoCreateInstance(cfg: EvolutionConfig): Promise<void>`
- `evoFetch` ganha `tolerateStatuses?: number[]` no `init`.

- [ ] **Step 1: `tolerateStatuses` no `evoFetch`**

Em `lib/evolution/client.ts`, na assinatura de `evoFetch`, trocar o tipo de `init`:

```ts
  init?: { method?: "GET" | "POST" | "DELETE"; body?: unknown; timeoutMs?: number },
```

por:

```ts
  init?: { method?: "GET" | "POST" | "DELETE"; body?: unknown; timeoutMs?: number; tolerateStatuses?: number[] },
```

E, no bloco `if (!res.ok) {`, inserir a tolerância como PRIMEIRA linha dentro do bloco:

```ts
  if (!res.ok) {
    // Alguns fluxos toleram certos status (ex.: delete de instância inexistente = 404).
    if (init?.tolerateStatuses?.includes(res.status)) return undefined as T;
    const text = await res.text().catch(() => "");
    throw new Error(`Evolution ${res.status}: ${text.slice(0, 500)}`);
  }
```

- [ ] **Step 2: `evoDeleteInstance` e `evoCreateInstance`**

Em `lib/evolution/client.ts`, adicionar após `evoLogout` (antes de `evoListGroups`):

```ts
/**
 * Deleta a instância na Evolution — apaga a sessão E o histórico de chats persistido
 * (DATABASE_SAVE_DATA_INSTANCE). É o que permite trocar de número sem herdar os grupos do
 * número anterior via /chat/findChats. Tolera 404: instância já inexistente não é erro,
 * então um retry (delete → create) é seguro.
 */
export async function evoDeleteInstance(cfg: EvolutionConfig): Promise<void> {
  await evoFetch<unknown>(cfg, `/instance/delete/${cfg.instance}`, {
    method: "DELETE",
    tolerateStatuses: [404],
  });
}

/**
 * Recria a instância com o MESMO nome e o payload mínimo (sem webhook — o app não usa).
 * Tolera 403/409: instância já existente não é erro (cobre um retry em que o delete
 * anterior não tenha pego). Depois disso, /instance/connect volta a devolver QR.
 */
export async function evoCreateInstance(cfg: EvolutionConfig): Promise<void> {
  await evoFetch<unknown>(cfg, `/instance/create`, {
    method: "POST",
    body: { instanceName: cfg.instance, integration: "WHATSAPP-BAILEYS", qrcode: true },
    tolerateStatuses: [403, 409],
  });
}
```

- [ ] **Step 3: Typecheck + suíte**

Run: `npx tsc --noEmit` → sem erros
Run: `npx vitest run` → PASS (nada quebra; `evoFetch` só ganhou um campo opcional)

- [ ] **Step 4: Commit**

```bash
git add lib/evolution/client.ts
git commit -m "feat: evoDeleteInstance/evoCreateInstance idempotentes (tolerateStatuses)"
```

---

### Task 2: "Desconectar" reseta a instância — ação + confirmação

**Files:**
- Modify: `app/(app)/disparos/actions.ts` (`disconnectNumberAction`)
- Modify: `app/(app)/disparos/_components/connection-strip.tsx` (texto do `confirm`)

**Interfaces:**
- Consumes: `evoDeleteInstance`, `evoCreateInstance` (Task 1); `evoLogout`, `getEvolutionConfig`, `createServerSupabase`, `setPauseAction`, `revalidateAll` (já no arquivo).

- [ ] **Step 1: Importar as funções novas**

Em `app/(app)/disparos/actions.ts`, trocar a linha de import do cliente:

```ts
import { evoConnect, evoConnectionState, evoListGroups, evoLogout } from "@/lib/evolution/client";
```

por:

```ts
import { evoConnect, evoConnectionState, evoListGroups, evoLogout, evoDeleteInstance, evoCreateInstance } from "@/lib/evolution/client";
```

- [ ] **Step 2: `disconnectNumberAction` vira reset**

Substituir a função `disconnectNumberAction` inteira por:

```ts
export async function disconnectNumberAction(): Promise<void> {
  const cfg = getEvolutionConfig(process.env);

  await setPauseAction(true, "Troca de número");

  // Reset da instância: solta a sessão (best-effort), APAGA a instância com o histórico de
  // chats que a Evolution guarda, e recria limpa. Sem o delete, /chat/findChats devolveria
  // os grupos do número anterior — e a troca de número não segregaria.
  try {
    await evoLogout(cfg);
  } catch {
    /* best-effort: pode já estar deslogado; o delete a seguir é o que importa */
  }
  await evoDeleteInstance(cfg);
  await evoCreateInstance(cfg);

  // A instância nova nasce vazia. Desativa os grupos do número que saiu (somem da lista,
  // registro fica para o histórico de envios). Um sync do número novo repovoa só com os dele.
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("communities")
    .update({ active: false })
    .not("wa_group_id", "is", null)
    .eq("active", true);
  if (error) throw new Error(`Falha ao aposentar os grupos do número: ${error.message}`);

  revalidateAll();
}
```

- [ ] **Step 3: Atualizar a confirmação na UI**

Em `app/(app)/disparos/_components/connection-strip.tsx`, na função `disconnect()`, substituir o `confirm(...)`:

```tsx
    const go = confirm(
      "Desconectar o número?\n\n" +
        "• Os envios ficam pausados na hora — nada sai até você retomar.\n" +
        "• A lista de grupos é preservada; nada é apagado.\n" +
        "• Para trocar de número: leia o novo QR com o celular novo, sincronize os grupos e retome os envios.",
    );
```

por:

```tsx
    const go = confirm(
      "Desconectar e trocar de número?\n\n" +
        "• Os envios ficam pausados na hora.\n" +
        "• Isso RESETA a conexão e ZERA a lista de grupos — a instância é recriada limpa.\n" +
        "• Os grupos habilitados do número anterior são perdidos (você reescolhe no novo).\n" +
        "• Depois: leia o novo QR com o número novo, sincronize os grupos e retome os envios.",
    );
```

- [ ] **Step 4: Typecheck + suíte**

Run: `npx tsc --noEmit` → sem erros
Run: `npx vitest run` → PASS

- [ ] **Step 5: Verificação manual (integração — Evolution de PRODUÇÃO, feita pelo usuário)**

Não é testável no ambiente de dev (toca a Evolution real). Após deploy, o usuário:
- Clica "Desconectar" → confirma o novo aviso → a instância é recriada (a tela volta a
  "Desconectado", com QR disponível). Envios ficam pausados.
- Pareia o **número novo** com o QR → "Sincronizar grupos" → confere que aparecem **só**
  os grupos do número novo (os exclusivos do antigo **não** voltam).
- Habilita os grupos desejados e retoma os envios.
- **Retry:** se algo falhar no meio, clicar "Desconectar" de novo completa sem sujar
  (delete tolera 404, create tolera já-existe).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/disparos/actions.ts" "app/(app)/disparos/_components/connection-strip.tsx"
git commit -m "feat: desconectar reseta a instancia (delete+create) e zera a lista de grupos"
```

---

## Self-Review

**Spec coverage:**
- ① `tolerateStatuses` + `evoDeleteInstance` + `evoCreateInstance` → Task 1. ✔
- ② `disconnectNumberAction` = pausa → logout best-effort → delete → create → desativa grupos → revalida → Task 2, Steps 1-2. ✔
- ③ Confirmação da UI reescrita → Task 2, Step 3. ✔
- Sem migration/webhook; delete/create idempotentes; grupos desativados (não apagados) → Global Constraints. ✔

**Placeholder scan:** todo step tem código/comando real e output esperado. Sem TBD/TODO. A verificação de integração é declaradamente manual (toca Evolution de produção) — não é omissão, é a natureza da mudança.

**Type consistency:** `evoDeleteInstance(cfg: EvolutionConfig): Promise<void>` e `evoCreateInstance(cfg: EvolutionConfig): Promise<void>` (Task 1) são importadas e chamadas com `cfg = getEvolutionConfig(process.env)` na Task 2. `evoFetch` mantém o retorno `Promise<T>`; `tolerateStatuses` retorna `undefined as T` no caminho tolerado — coerente com o uso `evoFetch<unknown>` das duas funções novas (o valor não é lido). O bloco de desativação de grupos é o mesmo já existente, com o mesmo shape de query.
