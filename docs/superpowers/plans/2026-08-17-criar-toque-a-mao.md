# Criar toque da API individual à mão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poder criar um toque da trilha API individual à mão, com um formulário enxuto, e poder editar a data de qualquer toque.

**Architecture:** A derivação de campos comum às duas trilhas (numeração, código, data) sai para um arquivo próprio e é reusada por `buildManualGroupPost` e pelo novo `buildManualTouch`. Uma server action monta o toque e insere — sem replanejar, porque toque nunca entra na fila. `avisoDeData` ganha um parâmetro obrigatório que separa a consequência de peça de grupo (cancela envios) da de toque (nenhuma). O botão de criar do cabeçalho passa a valer nas duas trilhas.

**Tech Stack:** Next.js 16 (App Router, server actions), TypeScript, Tailwind v4, Supabase, Vitest. UI em PT-BR.

## Global Constraints

- **Sem migration.** Todas as colunas de `campaign_touches` já existem, e todas têm valor padrão no banco.
- **Toque NUNCA entra na fila.** Nenhuma ação desta entrega chama `rescheduleCampaign`. A trilha API é manual por decisão de projeto (`buildGroupPieces` só monta Grupos; `updateTouchAction` não replaneja e `updateGroupPostAction` replaneja).
- **Não tocar** em `rescheduleCampaign`, `buildGroupPieces`, `dropAlreadyLive`, `partitionSchedulable`, `updateGroupPostAction`, nem em `new-group-post-form.tsx`.
- **As frases de aviso vistas hoje nas peças de grupo não podem mudar um caractere.** Só a variante de toque é nova.
- **`geraEnvio` é obrigatório, sem valor padrão** — é o compilador que garante que os dois call sites decidam conscientemente.
- **Nada bloqueia o botão Salvar.** Os avisos informam.
- **Copy e comentários em PT-BR.** Tokens de cor existentes: `text-risk`, `text-muted`, `text-ink`, `text-ink2`, `text-emeraldd`, `border-line`, `bg-emerald`/`bg-emeraldd`.
- Dentro de `_components/`, o import relativo `../../actions` é o padrão do arquivo; `@/lib/...` para o resto.
- Comandos de verificação: `npx tsc --noEmit` e `npm test` (baseline atual: **276** testes passando).

---

### Task 1: Extrair a derivação comum

Refatoração pura: nenhum comportamento muda. A prova disso é que os testes de `buildManualGroupPost` continuam passando **sem serem alterados**.

**Files:**
- Create: `lib/campaign-piece-fields.ts`
- Create: `lib/campaign-piece-fields.test.ts`
- Modify: `lib/campaign-manual-post.ts`

**Interfaces:**
- Consumes (já existem): `nextSortOrder`, `slugCode` de `@/lib/campaign-refine`; `buildCode` de `@/lib/ai/nomenclature`; `computeSendAt` de `@/lib/schedule`.
- Produces (a Task 2 depende deste nome, exato):
  - `derivarCampos(input, ctx): { sort_order: number; code: string; send_at: string }`

- [ ] **Step 1: Escrever os testes que falham**

Criar `lib/campaign-piece-fields.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { derivarCampos } from "@/lib/campaign-piece-fields";

/** Âncora com hora: sem hora, `new Date("2026-08-18")` vira meia-noite UTC e o dia local vira 17. */
const ANCORA = "2026-08-18 19:07";

const CTX = { existing: [{ sort_order: 0 }, { sort_order: 4 }], recipeType: "webinario", anchor: ANCORA };

describe("derivarCampos", () => {
  it("numera por maior + 1, nao pela contagem", () => {
    // Peça excluída deixa buraco: com 0 e 4, o próximo é 5 — nunca 2.
    expect(derivarCampos({ role: "Lembrete", offset_days: 0, offset_time: "" }, CTX).sort_order).toBe(5);
  });

  it("comeca em zero quando a trilha esta vazia", () => {
    const r = derivarCampos({ role: "Lembrete", offset_days: 0, offset_time: "" }, { ...CTX, existing: [] });
    expect(r.sort_order).toBe(0);
  });

  it("monta o codigo a partir do tipo de receita, do papel e da ancora", () => {
    expect(derivarCampos({ role: "Lembrete", offset_days: 0, offset_time: "" }, CTX).code).toBe(
      "webinario_lembrete_1808",
    );
  });

  it("calcula a data a partir da ancora, dos dias e da hora", () => {
    expect(derivarCampos({ role: "Lembrete", offset_days: -1, offset_time: "14:00" }, CTX).send_at).toBe(
      "2026-08-17 14:00",
    );
  });

  it("sem ancora, o codigo perde o sufixo de data e a data fica vazia", () => {
    const r = derivarCampos({ role: "Lembrete", offset_days: -1, offset_time: "14:00" }, { ...CTX, anchor: "" });
    expect(r.code).toBe("webinario_lembrete");
    expect(r.send_at).toBe("");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/campaign-piece-fields.test.ts`
Expected: FAIL — o módulo `@/lib/campaign-piece-fields` não existe.

- [ ] **Step 3: Criar o arquivo**

Criar `lib/campaign-piece-fields.ts`:

```ts
import { buildCode } from "@/lib/ai/nomenclature";
import { computeSendAt } from "@/lib/schedule";
import { nextSortOrder, slugCode } from "@/lib/campaign-refine";

/**
 * Os três campos que toda peça criada à mão deriva do contexto da campanha, iguais nas
 * duas trilhas: onde ela entra na ordem, o código que a identifica, e quando ela sai.
 *
 * Mora num arquivo próprio, e não dentro de um dos dois construtores, para que nenhum dos
 * dois precise importar do outro. São as mesmas derivações que o chat de refino usa ao
 * criar peça — é isso que torna uma peça feita à mão indistinguível de uma da IA.
 */
export function derivarCampos(
  input: { role: string; offset_days: number; offset_time: string },
  ctx: { existing: { sort_order: number }[]; recipeType: string; anchor: string },
): { sort_order: number; code: string; send_at: string } {
  return {
    sort_order: nextSortOrder(ctx.existing),
    code: buildCode(ctx.recipeType, slugCode(input.role), ctx.anchor),
    send_at: computeSendAt(ctx.anchor, input.offset_days, input.offset_time),
  };
}
```

- [ ] **Step 4: Fazer `buildManualGroupPost` usar a função**

Em `lib/campaign-manual-post.ts`, trocar a linha de import dos helpers e o corpo da função.

O import passa a ser:

```ts
import { pickReferenceGroups } from "@/lib/campaign-refine";
import { derivarCampos } from "@/lib/campaign-piece-fields";
```

(as importações de `buildCode`, `computeSendAt`, `nextSortOrder` e `slugCode` **saem** do arquivo — passam a ser responsabilidade de `campaign-piece-fields.ts`.)

E o corpo do `return` passa a ser:

```ts
): ManualPostDraft {
  const { sort_order, code, send_at } = derivarCampos(input, ctx);
  return {
    sort_order,
    offset_label: input.offset_label,
    role: input.role,
    // `communities` é a sugestão em texto livre da IA. Peça à mão não tem sugestão, e
    // deixá-la vazia impede o casador de nomes de inventar alvo por conta própria.
    communities: "",
    copy: input.copy,
    media: input.media,
    message_code: code,
    send_at,
    community_ids: pickReferenceGroups(ctx.existing),
  };
}
```

**Não altere `lib/campaign-manual-post.test.ts`.** Se algum teste de lá quebrar, a extração mudou comportamento e está errada.

- [ ] **Step 5: Verificar**

Run: `npx vitest run lib/campaign-piece-fields.test.ts lib/campaign-manual-post.test.ts`
Expected: PASS nos dois — 5 testes novos e os 9 de `buildManualGroupPost` **sem alteração**.

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add lib/campaign-piece-fields.ts lib/campaign-piece-fields.test.ts lib/campaign-manual-post.ts
git commit -m "refactor: extrai a derivacao comum de campos de peca"
```

---

### Task 2: `buildManualTouch`

TDD. Função pura, no mesmo molde da que já existe para peça de grupo.

**Files:**
- Create: `lib/campaign-manual-touch.ts`
- Create: `lib/campaign-manual-touch.test.ts`

**Interfaces:**
- Consumes (Task 1): `derivarCampos(input, ctx): { sort_order: number; code: string; send_at: string }` de `@/lib/campaign-piece-fields`.
- Produces (a Task 4 depende destes nomes, exatos): `ManualTouchInput`, `ManualTouchDraft`, `buildManualTouch(input, ctx)`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `lib/campaign-manual-touch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildManualTouch, type ManualTouchInput } from "@/lib/campaign-manual-touch";

/** Âncora com hora: sem hora, `new Date("2026-08-18")` vira meia-noite UTC e o dia local vira 17. */
const ANCORA = "2026-08-18 19:07";

const CTX = { existing: [{ sort_order: 0 }, { sort_order: 4 }], recipeType: "webinario", anchor: ANCORA };

function input(over: Partial<ManualTouchInput> = {}): ManualTouchInput {
  return {
    offset_label: "D-1",
    role: "Lembrete",
    meta_category: "UTILITY",
    template_body: "Oi {{1}}, é amanhã.",
    offset_days: -1,
    offset_time: "14:00",
    ...over,
  };
}

describe("buildManualTouch", () => {
  it("numera por maior + 1, nao pela contagem", () => {
    // Toque excluído deixa buraco: com 0 e 4, o próximo é 5 — nunca 2.
    expect(buildManualTouch(input(), CTX).sort_order).toBe(5);
  });

  it("o primeiro toque de uma trilha vazia comeca em zero", () => {
    expect(buildManualTouch(input(), { ...CTX, existing: [] }).sort_order).toBe(0);
  });

  it("monta o nome do template a partir do papel e da ancora", () => {
    expect(buildManualTouch(input(), CTX).template_name).toBe("webinario_lembrete_1808");
  });

  it("calcula a data a partir da ancora, dos dias e da hora", () => {
    expect(buildManualTouch(input(), CTX).send_at).toBe("2026-08-17 14:00");
  });

  it("sem ancora, o toque nasce sem data", () => {
    expect(buildManualTouch(input(), { ...CTX, anchor: "" }).send_at).toBe("");
  });

  it("passa rotulo, papel, categoria e corpo sem alterar", () => {
    const d = buildManualTouch(
      input({ offset_label: "D0", meta_category: "MARKETING", template_body: "Corpo" }),
      CTX,
    );
    expect(d.offset_label).toBe("D0");
    expect(d.role).toBe("Lembrete");
    expect(d.meta_category).toBe("MARKETING");
    expect(d.template_body).toBe("Corpo");
  });

  it("nao devolve os campos que o banco preenche sozinho", () => {
    // buttons, window_steps, fallback_copy, crm_action, risk_flag e utility_alt têm valor
    // padrão na tabela; escrevê-los aqui seria repetir o schema em dois lugares.
    expect(Object.keys(buildManualTouch(input(), CTX)).sort()).toEqual([
      "meta_category",
      "offset_label",
      "role",
      "send_at",
      "sort_order",
      "template_body",
      "template_name",
    ]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/campaign-manual-touch.test.ts`
Expected: FAIL — o módulo `@/lib/campaign-manual-touch` não existe.

- [ ] **Step 3: Implementar**

Criar `lib/campaign-manual-touch.ts`:

```ts
import { derivarCampos } from "@/lib/campaign-piece-fields";

export type ManualTouchInput = {
  offset_label: string;
  role: string;
  meta_category: "UTILITY" | "MARKETING";
  template_body: string;
  /** Negativo = antes da âncora. */
  offset_days: number;
  /** "HH:mm". Vazio deixa o toque na hora da própria âncora. */
  offset_time: string;
};

export type ManualTouchDraft = {
  sort_order: number;
  offset_label: string;
  role: string;
  meta_category: "UTILITY" | "MARKETING";
  template_body: string;
  template_name: string;
  send_at: string;
};

/**
 * Monta a linha de um toque criado à mão.
 *
 * Os campos que a tabela preenche sozinha — buttons, window_steps, fallback_copy,
 * crm_action, risk_flag e utility_alt — não aparecem aqui de propósito: nascem vazios pelo
 * default do banco e se preenchem no editor, que já sabe editar todos eles. Repetir os
 * vazios aqui seria manter o schema em dois lugares.
 */
export function buildManualTouch(
  input: ManualTouchInput,
  ctx: { existing: { sort_order: number }[]; recipeType: string; anchor: string },
): ManualTouchDraft {
  const { sort_order, code, send_at } = derivarCampos(input, ctx);
  return {
    sort_order,
    offset_label: input.offset_label,
    role: input.role,
    meta_category: input.meta_category,
    template_body: input.template_body,
    template_name: code,
    send_at,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/campaign-manual-touch.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/campaign-manual-touch.ts lib/campaign-manual-touch.test.ts
git commit -m "feat: buildManualTouch monta o toque feito a mao"
```

---

### Task 3: `avisoDeData` distingue peça que gera envio

TDD. O parâmetro é obrigatório de propósito: é o compilador que obriga os dois call sites a decidirem.

**Files:**
- Modify: `lib/schedule.ts`
- Modify: `lib/schedule.test.ts`
- Modify: `app/(app)/campanhas/[id]/_components/post-card.tsx`

**Interfaces:**
- Consumes: `toInstant` de `@/lib/schedule` (já usado pela função).
- Produces (a Task 4 depende desta assinatura, exata):
  - `avisoDeData(sendAt: string, now: Date, geraEnvio: boolean): string`

- [ ] **Step 1: Ajustar os testes existentes e escrever os novos**

Em `lib/schedule.test.ts`, no `describe("avisoDeData")` que já existe, **acrescentar `true` como terceiro argumento em todas as chamadas** — as frases esperadas continuam exatamente as mesmas.

E acrescentar, ao final do mesmo `describe`:

```ts
  it("com geraEnvio false, nenhuma frase menciona envios cancelados", () => {
    const agora = new Date("2026-08-18T12:00:00-03:00");
    const semData = avisoDeData("", agora, false);
    const invalida = avisoDeData("0026-08-18 19:07", agora, false);
    const passada = avisoDeData("2026-08-17 14:00", agora, false);

    expect(semData).toBe("Sem data: a peça não entra na fila até você marcar um horário.");
    expect(invalida).toBe("Data inválida — confira o ano. A peça não entra na fila.");
    expect(passada).toBe("Essa data já passou. A peça não entra na fila — nada é agendado para trás.");
  });

  it("com geraEnvio true, as frases continuam as de hoje", () => {
    const agora = new Date("2026-08-18T12:00:00-03:00");
    expect(avisoDeData("", agora, true)).toBe(
      "Sem data: a peça não entra na fila até você marcar um horário. Os envios já agendados dela são cancelados.",
    );
  });

  it("data valida no futuro nao avisa nada, com ou sem envio", () => {
    const agora = new Date("2026-08-18T12:00:00-03:00");
    expect(avisoDeData("2026-08-19 10:00", agora, true)).toBe("");
    expect(avisoDeData("2026-08-19 10:00", agora, false)).toBe("");
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/schedule.test.ts`
Expected: FAIL nos casos novos — a função ainda ignora o terceiro argumento, então as variantes de `geraEnvio false` voltam a frase com "Os envios já agendados…".

- [ ] **Step 3: Implementar**

Em `lib/schedule.ts`, substituir a função `avisoDeData` inteira por:

```ts
/**
 * O aviso que a tela mostra abaixo do campo de data. Devolve "" quando não há o que avisar.
 *
 * `geraEnvio` separa as duas trilhas e é obrigatório de propósito, sem valor padrão: peça
 * de grupo alimenta a fila, e mudar a data dela cancela os envios já agendados; toque da
 * API individual nunca entra na fila, e prometer cancelamento ali seria mentira na tela.
 * Sem default, o compilador obriga cada chamador a decidir.
 *
 * Nenhum destes casos bloqueia o Salvar: quem reorganiza uma campanha passa por estados
 * intermediários.
 */
export function avisoDeData(sendAt: string, now: Date, geraEnvio: boolean): string {
  if (!sendAt) {
    return geraEnvio
      ? "Sem data: a peça não entra na fila até você marcar um horário. Os envios já agendados dela são cancelados."
      : "Sem data: a peça não entra na fila até você marcar um horário.";
  }

  const iso = toInstant(sendAt);
  if (!iso) {
    return geraEnvio
      ? "Data inválida — confira o ano. A peça não entra na fila, e os envios já agendados dela são cancelados."
      : "Data inválida — confira o ano. A peça não entra na fila.";
  }

  if (new Date(iso).getTime() <= now.getTime()) {
    return geraEnvio
      ? "Essa data já passou. A peça não entra na fila — nada é agendado para trás. Os envios já agendados dela são cancelados."
      : "Essa data já passou. A peça não entra na fila — nada é agendado para trás.";
  }

  return "";
}
```

As seis frases são copy distinta, não lógica duplicada — escrevê-las inteiras é o que garante que as três de hoje não mudem um caractere.

- [ ] **Step 4: Atualizar o call site que o compilador vai cobrar**

Em `app/(app)/campanhas/[id]/_components/post-card.tsx`, a chamada existente passa a ser:

```tsx
  const avisoData = avisoDeData(f.send_at, new Date(), true);
```

Peça de grupo gera envio: `true`.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm test`
Expected: toda a suíte verde.

- [ ] **Step 6: Commit**

```bash
git add lib/schedule.ts lib/schedule.test.ts "app/(app)/campanhas/[id]/_components/post-card.tsx"
git commit -m "feat: aviso de data distingue peca que gera envio de toque"
```

---

### Task 4: A ação de criar toque e o campo de data no editor

Juntas num commit só: `TouchFields` ganhar `send_at` quebra o typecheck de `touch-card.tsx` até o campo existir lá. Separar deixaria a árvore sem compilar entre duas tarefas.

**Files:**
- Modify: `app/(app)/campanhas/actions.ts`
- Modify: `app/(app)/campanhas/[id]/_components/touch-card.tsx`

**Interfaces:**
- Consumes: `buildManualTouch` e `ManualTouchInput` (Task 2) de `@/lib/campaign-manual-touch`; `avisoDeData(sendAt, now, geraEnvio)` (Task 3), `toDatetimeLocal`, `fromDatetimeLocal` de `@/lib/schedule`.
- Produces (a Task 5 depende desta assinatura, exata):
  - `createTouchAction(campaignId: string, input: ManualTouchInput): Promise<void>`
  - `TouchFields` passa a incluir `send_at: string`.

- [ ] **Step 1: Importar a montagem do toque**

Em `app/(app)/campanhas/actions.ts`, acrescentar aos imports do topo:

```ts
import { buildManualTouch, type ManualTouchInput } from "@/lib/campaign-manual-touch";
```

- [ ] **Step 2: Acrescentar `send_at` ao tipo do editor**

No tipo `TouchFields`, acrescentar como última propriedade:

```ts
  send_at: string;
```

`updateTouchAction` **não muda em mais nada**: ela já grava o objeto inteiro, e continua sem chamar `rescheduleCampaign`.

- [ ] **Step 3: Acrescentar a ação ao final do arquivo**

```ts
/**
 * Cria um toque à mão.
 *
 * SEM `rescheduleCampaign`: a trilha API individual é manual e nunca entra na fila
 * (`buildGroupPieces` só monta a trilha Grupos). Criar toque não mexe em envio nenhum.
 *
 * Os campos que o formulário enxuto não pede — botões, janela de 24h, fallback, ação de
 * CRM, risco e variante utility — nascem vazios pelo default da tabela e se preenchem no
 * editor, que já sabe editar todos eles.
 */
export async function createTouchAction(
  campaignId: string,
  input: ManualTouchInput,
): Promise<void> {
  const role = input.role.trim();
  const templateBody = input.template_body.trim();
  if (!role) throw new Error("O toque precisa de um papel.");
  if (!templateBody) throw new Error("O toque precisa de um corpo de template.");

  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campanha não encontrada.");

  const recipe = campaign.recipe_id ? await getRecipe(campaign.recipe_id) : null;
  const anchorLabel = recipe?.inputs.find((i) => i.is_anchor)?.label ?? "";
  const anchorValue = anchorLabel ? (campaign.inputs[anchorLabel] ?? "") : "";

  const draft = buildManualTouch(
    { ...input, role, template_body: templateBody },
    {
      existing: campaign.touches,
      recipeType: recipe?.recipe_type ?? "",
      anchor: anchorValue,
    },
  );

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("campaign_touches")
    .insert({ campaign_id: campaignId, ...draft });
  if (error) throw new Error(`Falha ao criar o toque: ${error.message}`);

  revalidatePath(`/campanhas/${campaignId}`);
}
```

- [ ] **Step 4: Levar a data para o estado do editor**

Em `app/(app)/campanhas/[id]/_components/touch-card.tsx`, trocar a linha que importa de `@/lib/schedule` por:

```tsx
import { avisoDeData, formatSendAt, fromDatetimeLocal, toDatetimeLocal } from "@/lib/schedule";
```

E, no `useState<TouchFields>` inicial, acrescentar `send_at` à última linha:

```tsx
    template_name: touch.template_name, utility_alt: touch.utility_alt, send_at: touch.send_at,
```

- [ ] **Step 5: Calcular o aviso**

Logo depois da declaração do estado `f`, acrescentar:

```tsx
  // `false`: toque nunca entra na fila, então nenhuma frase pode prometer cancelamento de
  // envio. Nada disto bloqueia o Salvar.
  const avisoData = avisoDeData(f.send_at, new Date(), false);
```

- [ ] **Step 6: Acrescentar o campo ao formulário**

No modo de edição, entre o `<label>` da **"Ação de CRM"** e o `<label>` do checkbox de risco, acrescentar:

```tsx
      <label className="block">
        <span className="text-[10px] font-mono uppercase text-muted">Data e hora do envio (horário de Brasília)</span>
        <input
          type="datetime-local"
          value={toDatetimeLocal(f.send_at)}
          onChange={(e) => setF({ ...f, send_at: fromDatetimeLocal(e.target.value) })}
          className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono"
        />
      </label>
      {avisoData && <p className="text-xs text-risk">{avisoData}</p>}
```

- [ ] **Step 7: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros. `touch-card.tsx` é o único lugar que monta um objeto `TouchFields`; não há segundo call site a atualizar.

Run: `npm test`
Expected: toda a suíte verde.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/campanhas/actions.ts" "app/(app)/campanhas/[id]/_components/touch-card.tsx"
git commit -m "feat: criar toque a mao e editar a data do toque"
```

---

### Task 5: O formulário e os botões nas duas trilhas

**Files:**
- Create: `app/(app)/campanhas/[id]/_components/new-touch-form.tsx`
- Modify: `app/(app)/campanhas/[id]/_components/campaign-view.tsx`

**Interfaces:**
- Consumes (Task 4): `createTouchAction(campaignId: string, input: ManualTouchInput): Promise<void>` de `../../actions`; o tipo `ManualTouchInput` de `@/lib/campaign-manual-touch`; `computeSendAt` de `@/lib/schedule`.
- Produces: nada — é a ponta da cadeia.

- [ ] **Step 1: Criar o formulário**

Criar `app/(app)/campanhas/[id]/_components/new-touch-form.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeSendAt } from "@/lib/schedule";
import type { ManualTouchInput } from "@/lib/campaign-manual-touch";
import { createTouchAction } from "../../actions";

export function NewTouchForm({
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
  const [f, setF] = useState<Omit<ManualTouchInput, "offset_days">>({
    offset_label: "",
    role: "",
    meta_category: "UTILITY",
    template_body: "",
    offset_time: "",
  });
  // Guardado como texto: <input type="number"> descarta o "-" enquanto se digita, e
  // "negativo = antes da âncora" é o caso de uso do campo.
  const [diasStr, setDiasStr] = useState("0");

  const offsetDays = Number(diasStr) || 0;
  const previsto = computeSendAt(anchor, offsetDays, f.offset_time);

  function salvar() {
    setErro(null);
    startTransition(async () => {
      try {
        await createTouchAction(campaignId, { ...f, offset_days: offsetDays });
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
          <span className="text-[10px] font-mono uppercase text-muted">Categoria Meta</span>
          <select value={f.meta_category} onChange={(e) => setF({ ...f, meta_category: e.target.value as "UTILITY" | "MARKETING" })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm">
            <option value="UTILITY">UTILITY</option>
            <option value="MARKETING">MARKETING</option>
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-[10px] font-mono uppercase text-muted">Papel</span>
        <input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Lembrete" className="mt-1 w-full rounded-lg border border-line p-2 text-sm" />
      </label>

      <label className="block">
        <span className="text-[10px] font-mono uppercase text-muted">Corpo do template</span>
        <textarea value={f.template_body} onChange={(e) => setF({ ...f, template_body: e.target.value })} rows={4} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] font-mono uppercase text-muted">Dias (negativo = antes)</span>
          <input type="text" inputMode="numeric" value={diasStr} onChange={(e) => setDiasStr(e.target.value)} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-[10px] font-mono uppercase text-muted">Hora (HH:mm)</span>
          <input value={f.offset_time} onChange={(e) => setF({ ...f, offset_time: e.target.value })} placeholder="14:00" className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" />
        </label>
      </div>

      <p className="font-mono text-xs text-muted">
        {previsto ? `Fica marcado para ${previsto}` : "Sem data — confira a hora, ou a campanha está sem âncora."}
      </p>

      <p className="text-[11px] text-muted">
        Botões, fallback, ação de CRM e risco você preenche no Editar depois de criar.
      </p>

      {erro && <p className="rounded-lg border border-risk/30 bg-risk/5 p-3 text-sm text-risk">{erro}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={salvar} disabled={pending || !f.role.trim() || !f.template_body.trim()} className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50">
          {pending ? "Criando…" : "Criar toque"}
        </button>
        <button onClick={onClose} disabled={pending} className="rounded-lg border border-line text-sm px-3 py-1.5 disabled:opacity-50">Cancelar</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Importar o formulário na tela**

Em `app/(app)/campanhas/[id]/_components/campaign-view.tsx`, acrescentar aos imports locais, junto dos outros `./`:

```tsx
import { NewTouchForm } from "./new-touch-form";
```

- [ ] **Step 3: O botão do cabeçalho passa a valer nas duas trilhas**

Ainda em `campaign-view.tsx`, o botão de criar está hoje embrulhado numa condição de trilha:

```tsx
        {track === "grupos" && (
          <button
            onClick={() => {
              …
            }}
            className="font-mono text-xs text-muted hover:text-emeraldd"
          >
            + nova peça
          </button>
        )}
```

**Remova as duas linhas do embrulho** — a `{track === "grupos" && (` que abre e a `)}` que fecha — deixando o `<button>` como filho direto do contêiner de controles, sem nenhuma condição. O conteúdo do `onClick` e as classes não mudam.

**Atenção:** existe um segundo `{track === "grupos" && (` logo abaixo, envolvendo a `<CampaignGroupsBar>`. Esse **não** pode ser tocado — o editor em massa de alvos continua exclusivo da trilha Grupos.

- [ ] **Step 3b: Fechar o formulário ao trocar de trilha**

`criando` é um estado só, compartilhado pelas duas trilhas. Sem isto, abrir o formulário na trilha Grupos e trocar para a API mostraria o formulário de toque já aberto, sem ninguém ter pedido.

Nos **dois** botões que trocam a trilha (`onClick={() => setTrack("api")}` e `onClick={() => setTrack("grupos")}`), acrescentar o fechamento:

```tsx
          <button onClick={() => { setTrack("api"); setCriando(false); }} className={`rounded-md px-3 py-1.5 text-sm font-medium ${track === "api" ? "bg-white shadow-sm" : "text-muted"}`}>
```

```tsx
          <button onClick={() => { setTrack("grupos"); setCriando(false); }} className={`rounded-md px-3 py-1.5 text-sm font-medium ${track === "grupos" ? "bg-white shadow-sm" : "text-muted"}`}>
```

O resto de cada botão — as classes e o rótulo com a contagem — fica como está.

- [ ] **Step 4: Renderizar o formulário certo em cada trilha**

Na lista da trilha **API individual** (o ramo `track === "api"`, que hoje só faz `.map` dos `TouchCard`), acrescentar depois do `.map`, dentro da mesma `<div className="space-y-5 max-w-3xl">`:

```tsx
                  {criando ? (
                    <div ref={formularioRef}>
                      <NewTouchForm
                        campaignId={campaign.id}
                        anchor={anchor}
                        onClose={() => setCriando(false)}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setCriando(true)}
                      className="w-full rounded-xl border border-dashed border-line py-3 text-sm font-medium text-muted hover:border-emerald/40 hover:text-emeraldd"
                    >
                      + Novo toque à mão
                    </button>
                  )}
```

O ramo da trilha Grupos, que já tem o `NewGroupPostForm` e seu botão tracejado, **fica exatamente como está**.

- [ ] **Step 5: Corrigir a frase do limpar trilha**

No modal de limpar trilha, remover o bloco que hoje é:

```tsx
              {track === "api" && (
                <> Só o chat de refino recria peças desta trilha — não existe criar toque à mão.</>
              )}
```

Ele deixou de ser verdade nesta entrega.

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm test`
Expected: toda a suíte verde.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/campanhas/[id]/_components/new-touch-form.tsx" "app/(app)/campanhas/[id]/_components/campaign-view.tsx"
git commit -m "feat: formulario de novo toque e botao de criar nas duas trilhas"
```

---

## Verificação manual (depois da Task 5)

Rodar `npm run dev`. Use uma campanha **em rascunho**.

- [ ] **Criar toque.** Na trilha API individual, "+ nova peça" no cabeçalho → preencher papel, categoria, corpo, dias e hora → a linha de prévia mostra a data → Criar toque. O toque aparece na lista, com nome de template no mesmo padrão dos outros, e no **Calendário** na data certa.
- [ ] **Completar no Editar.** Abrir o *Editar* do toque recém-criado: botões, fallback e ação de CRM estão vazios e editáveis. Acrescentar um botão, salvar, conferir que aparece no cartão.
- [ ] **Editar a data do toque.** Mudar a data pelo *Editar*, salvar, conferir que o cabeçalho e o Calendário refletem — e que **nada muda em `/disparos`**, porque toque não gera envio.
- [ ] **Os avisos, e a diferença entre as trilhas.** No toque, limpar a data: o aviso aparece e **não** menciona envios cancelados. Numa peça de grupo, limpar a data: o aviso **continua** mencionando. Nos dois casos o **Salvar continua habilitado**.
- [ ] **O sinal de menos.** No campo Dias do formulário de toque, digitar `-1` e conferir que o sinal sobrevive e a prévia recua um dia.
- [ ] **O botão nas duas trilhas.** O "+ nova peça" aparece na trilha API e na Grupos, e abre o formulário certo em cada uma. A barra de grupos (o editor em massa de alvos) **continua aparecendo só na trilha Grupos**.
- [ ] **Trocar de trilha fecha o formulário.** Abrir o formulário numa trilha, trocar para a outra, e conferir que ele **não** aparece já aberto lá.
- [ ] **A frase corrigida.** Abrir *limpar trilha* na trilha API e conferir que a frase sobre "só o chat de refino recria" sumiu.

## Riscos conhecidos (do spec, não são bugs a corrigir aqui)

- **Extrair `derivarCampos` mexe em código que funciona e tem teste.** A trava é os testes de `buildManualGroupPost` não poderem ser alterados: se a extração mudar comportamento, eles quebram.
- **Toque criado em campanha sem âncora nasce sem data** — existe, mas some do Pipeline e do Calendário, que se organizam por data. O aviso de "sem data" fica visível no editor.
- **A copy dos avisos de toque ainda fala em "fila".** É verdade (toque nunca entra na fila), mas não é o que importa para um toque — o que importa é sumir do Calendário. Ajuste de texto para outra vez; a decisão desta entrega foi só remover a promessa falsa sobre envios cancelados.
- **O desalinhamento da duplicação continua em aberto**, medido e registrado em `2026-08-17-editar-data-e-achar-o-criar-design.md`: a campanha Hotseat tem 10 peças para 14 slots, e 9 delas pegariam a data de outro slot.
