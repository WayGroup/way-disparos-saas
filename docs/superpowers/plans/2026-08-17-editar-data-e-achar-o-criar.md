# Editar a data da peça de grupo, e achar o botão de criar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poder mudar a data e hora de envio de uma peça da trilha Grupos pelo formulário de edição, e enxergar o botão de criar peça sem rolar a lista inteira.

**Architecture:** Duas funções puras convertem entre o formato guardado (`"YYYY-MM-DD HH:mm"`, horário de São Paulo, sem fuso) e o do seletor nativo (`"YYYY-MM-DDTHH:mm"`). `PostFields` ganha `send_at`, e como `updateGroupPostAction` já termina em `rescheduleCampaign`, a fila se remonta sozinha ao salvar — nenhuma orquestração nova. O botão de criar sobe para o cabeçalho da trilha, com rolagem até o formulário.

**Tech Stack:** Next.js 16 (App Router, client components + server actions), TypeScript, Tailwind v4, Vitest. UI em PT-BR.

## Global Constraints

- **Sem migration.** A coluna `send_at` já existe em `campaign_group_posts`.
- **Só a trilha Grupos.** Nada de editar data de toque da API individual, nada de criar toque à mão.
- **Não tocar** em `computeSendAt`, `toInstant`, `formatSendAt`, `partitionSchedulable`, `rescheduleCampaign`, `dropAlreadyLive`, nem em `new-group-post-form.tsx` (o formulário de criação continua relativo à âncora, por decisão consciente).
- **Data no passado e data vazia avisam, mas NUNCA bloqueiam o Salvar** — quem reorganiza uma campanha passa por estados intermediários.
- **Conversão malformada devolve `""`**, nunca a string original: um valor inválido que passasse adiante viraria `send_at` quebrado no banco, e o erro só apareceria na aprovação, longe da causa.
- **Copy e comentários em PT-BR.** Tokens de cor existentes: `text-risk`, `text-muted`, `text-ink`, `text-emeraldd`, `border-line`, `bg-emerald`/`bg-emeraldd`.
- Dentro de `_components/`, o import relativo `../../actions` é o padrão do arquivo; `@/lib/...` para o resto.
- Comandos de verificação: `npx tsc --noEmit` e `npm test` (baseline atual: 264 testes passando).

---

### Task 1: As duas conversões de formato

TDD: o teste vem antes. São funções puras, e é a única lógica de verdade da entrega — errar aqui desloca envio em uma hora ou um dia, em silêncio.

**Files:**
- Modify: `lib/schedule.ts`
- Test: `lib/schedule.test.ts` (já existe, com 18 testes — acrescente ao final, não reescreva)

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces (as Tasks 2 e 3 dependem destes nomes, exatos):
  - `toDatetimeLocal(sendAt: string): string`
  - `fromDatetimeLocal(value: string): string`

- [ ] **Step 1: Escrever os testes que falham**

Em `lib/schedule.test.ts`, trocar a linha de import do topo por:

```ts
import {
  computeSendAt,
  formatSendAt,
  fromDatetimeLocal,
  toDatetimeLocal,
  toInstant,
} from "@/lib/schedule";
```

E acrescentar ao final do arquivo:

```ts
describe("toDatetimeLocal", () => {
  it("troca o espaço pelo T que o seletor do navegador espera", () => {
    expect(toDatetimeLocal("2026-08-18 19:07")).toBe("2026-08-18T19:07");
  });

  it("data vazia devolve vazio — peça sem data é estado válido", () => {
    expect(toDatetimeLocal("")).toBe("");
  });

  it("valor malformado devolve vazio, não ele mesmo", () => {
    // Devolver a string original encheria o campo do formulário com lixo que o
    // navegador ignora — e o usuário salvaria sem perceber.
    expect(toDatetimeLocal("18/08/2026 19:07")).toBe("");
    expect(toDatetimeLocal("amanhã")).toBe("");
  });
});

describe("fromDatetimeLocal", () => {
  it("troca o T pelo espaço do formato guardado", () => {
    expect(fromDatetimeLocal("2026-08-18T19:07")).toBe("2026-08-18 19:07");
  });

  it("descarta os segundos que alguns navegadores acrescentam", () => {
    expect(fromDatetimeLocal("2026-08-18T19:07:00")).toBe("2026-08-18 19:07");
  });

  it("valor vazio devolve vazio", () => {
    expect(fromDatetimeLocal("")).toBe("");
  });

  it("valor malformado devolve vazio", () => {
    expect(fromDatetimeLocal("2026-08-18")).toBe("");
  });

  it("ida e volta preserva a data guardada", () => {
    const guardado = "2026-08-17 14:00";
    expect(fromDatetimeLocal(toDatetimeLocal(guardado))).toBe(guardado);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/schedule.test.ts`
Expected: FAIL — `toDatetimeLocal`/`fromDatetimeLocal` não existem. Os 18 testes que já estavam no arquivo continuam passando.

- [ ] **Step 3: Implementar**

Em `lib/schedule.ts`, acrescentar ao final do arquivo:

```ts
/**
 * O formato da agenda editorial ("2026-08-18 19:07") e o do seletor nativo
 * ("2026-08-18T19:07") são a mesma informação com separador diferente. Uma regex serve às
 * duas direções: aceita espaço ou T, e tolera os segundos que alguns navegadores mandam.
 */
const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?$/;

/** "2026-08-18 19:07" → "2026-08-18T19:07", que é o que `<input type="datetime-local">` lê. */
export function toDatetimeLocal(sendAt: string): string {
  const m = sendAt.match(DATETIME_RE);
  return m ? `${m[1]}T${m[2]}` : "";
}

/**
 * "2026-08-18T19:07" → "2026-08-18 19:07", o formato guardado.
 *
 * Valor que não casa devolve "" em vez da string original: um send_at malformado no banco
 * só apareceria na validação da aprovação, longe da causa. Vazio é resposta honesta —
 * peça sem data existe, apenas fica fora da fila.
 */
export function fromDatetimeLocal(value: string): string {
  const m = value.match(DATETIME_RE);
  return m ? `${m[1]} ${m[2]}` : "";
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/schedule.test.ts`
Expected: PASS — 26 testes (os 18 anteriores + 8 novos).

- [ ] **Step 5: Commit**

```bash
git add lib/schedule.ts lib/schedule.test.ts
git commit -m "feat: conversao entre o send_at guardado e o do seletor de data"
```

---

### Task 2: O campo de data no editor da peça

Sem teste de unidade novo: é um campo de formulário ligado a uma server action que já existe. A conversão já está coberta pela Task 1.

**Files:**
- Modify: `app/(app)/campanhas/actions.ts`
- Modify: `app/(app)/campanhas/[id]/_components/post-card.tsx`

**Interfaces:**
- Consumes (Task 1): `toDatetimeLocal(sendAt: string): string` e `fromDatetimeLocal(value: string): string`, de `@/lib/schedule`.
- Produces: `PostFields` passa a incluir `send_at: string`.

- [ ] **Step 1: Acrescentar o campo ao tipo**

Em `app/(app)/campanhas/actions.ts`, no tipo `PostFields`, acrescentar a linha `send_at`:

```ts
export type PostFields = {
  offset_label: string;
  role: string;
  communities: string;
  copy: string;
  media: string;
  message_code: string;
  send_at: string;
};
```

**Nenhuma outra mudança em `actions.ts`.** `updateGroupPostAction` grava o objeto inteiro e já termina em `rescheduleCampaign` — a fila se remonta sozinha.

- [ ] **Step 2: Importar as conversões e o teste de data passada**

Em `app/(app)/campanhas/[id]/_components/post-card.tsx`, trocar a linha que importa de `@/lib/schedule` por:

```tsx
import { formatSendAt, fromDatetimeLocal, toDatetimeLocal } from "@/lib/schedule";
```

E acrescentar, junto dos outros imports:

```tsx
import { isPast } from "@/lib/sends/plan";
```

(`lib/sends/plan.ts` e tudo que ela importa são módulos puros, sem `server-only` — pode ser importada de client component.)

- [ ] **Step 3: Levar a data para o estado do formulário**

Ainda em `post-card.tsx`, no `useState<PostFields>` inicial, acrescentar `send_at`:

```tsx
  const [f, setF] = useState<PostFields>({
    offset_label: post.offset_label, role: post.role, communities: post.communities, copy: post.copy, media: post.media,
    message_code: post.message_code, send_at: post.send_at,
  });
```

- [ ] **Step 4: Calcular o aviso**

Logo depois da declaração do estado `f`, acrescentar:

```tsx
  // Os dois casos avisam mas NÃO bloqueiam o Salvar: quem reorganiza uma campanha passa
  // por estados intermediários. O aviso só torna visível o que o agendamento já faz em
  // silêncio — nada é agendado para trás, e peça sem data fica fora da fila.
  const avisoData = !f.send_at
    ? "Sem data: a peça não entra na fila até você marcar um horário."
    : isPast(f.send_at, new Date())
      ? "Essa data já passou. A peça não entra na fila — nada é agendado para trás."
      : "";
```

- [ ] **Step 5: Acrescentar o campo ao formulário**

No modo de edição, entre o `<label>` do "Briefing da mídia" e a `<div className="flex gap-2 pt-1">` dos botões, acrescentar:

```tsx
      <label className="block">
        <span className="text-[10px] font-mono uppercase text-muted">Data e hora do envio</span>
        <input
          type="datetime-local"
          value={toDatetimeLocal(f.send_at)}
          onChange={(e) => setF({ ...f, send_at: fromDatetimeLocal(e.target.value) })}
          className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono"
        />
      </label>
      {avisoData && <p className="text-xs text-risk">{avisoData}</p>}
```

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros. `post-card.tsx` é o **único** lugar do projeto que monta um objeto `PostFields` (verificado: as outras duas menções ao tipo são a própria declaração em `actions.ts:55` e o parâmetro de `updateGroupPostAction` em `actions.ts:445`) — não há um segundo call site a atualizar.

Run: `npm test`
Expected: toda a suíte verde (264 da baseline + 8 da Task 1 = 272).

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/campanhas/actions.ts" "app/(app)/campanhas/[id]/_components/post-card.tsx"
git commit -m "feat: editar a data e hora de envio da peca de grupo"
```

---

### Task 3: O botão de criar no cabeçalho, e a rolagem até o formulário

**Files:**
- Modify: `app/(app)/campanhas/[id]/_components/campaign-view.tsx`

**Interfaces:**
- Consumes: o estado `criando` e o componente `NewGroupPostForm`, ambos já presentes no arquivo.
- Produces: nada — é a ponta da cadeia.

- [ ] **Step 1: Acrescentar os hooks que faltam ao import**

Em `app/(app)/campanhas/[id]/_components/campaign-view.tsx`, trocar a primeira linha de import do React por:

```tsx
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
```

(O arquivo já importa `useState`, `useTransition` e `useMemo`; `useEffect` e `useRef` são os novos.)

- [ ] **Step 2: Criar o ref e a rolagem**

Junto das outras declarações de estado do componente, logo depois de `const [criando, setCriando] = useState(false);`, acrescentar:

```tsx
  const formularioRef = useRef<HTMLDivElement>(null);

  // Sem isto, clicar em "+ nova peça" no cabeçalho não produz efeito visível: o formulário
  // abre no fim de uma lista que, numa campanha real, tem uma dúzia de cartões.
  useEffect(() => {
    if (criando) {
      formularioRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [criando]);
```

- [ ] **Step 3: O botão no cabeçalho da trilha**

Logo depois do `</button>` que fecha o botão **"limpar trilha"**, acrescentar:

```tsx
        {track === "grupos" && (
          <button
            onClick={() => setCriando(true)}
            className="font-mono text-xs text-muted hover:text-emeraldd"
          >
            + nova peça
          </button>
        )}
```

Só na trilha Grupos: criar à mão não existe na trilha API individual.

- [ ] **Step 4: Envolver o formulário no ref**

Na lista da trilha Grupos, trocar o bloco que hoje é:

```tsx
                  {criando ? (
                    <NewGroupPostForm
                      campaignId={campaign.id}
                      anchor={anchor}
                      onClose={() => setCriando(false)}
                    />
                  ) : (
```

por:

```tsx
                  {criando ? (
                    <div ref={formularioRef}>
                      <NewGroupPostForm
                        campaignId={campaign.id}
                        anchor={anchor}
                        onClose={() => setCriando(false)}
                      />
                    </div>
                  ) : (
```

O botão tracejado do fim da lista, no `else`, **fica como está** — quem já está no fim da lista o encontra naturalmente.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm test`
Expected: toda a suíte verde (272 testes).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/campanhas/[id]/_components/campaign-view.tsx"
git commit -m "feat: botao de nova peca no cabecalho da trilha, com rolagem ate o formulario"
```

---

## Verificação manual (depois da Task 3)

Rodar `npm run dev`. Use uma campanha **em rascunho**.

- [ ] **Mudar a data.** Na trilha Grupos, Editar numa peça → mudar a data e hora para outro dia → Salvar. Conferir: o `📅` do cabeçalho do cartão mostra a data nova; a visão Calendário move a peça de dia; em `/disparos`, a fila daquela peça foi reagendada para o horário novo.
- [ ] **Aviso de data vazia.** Editar, limpar o campo de data, conferir o aviso "Sem data…" em vermelho e que o botão **Salvar continua habilitado**. Salvar e conferir que a peça continua na lista, sem data.
- [ ] **Aviso de data passada.** Editar, pôr uma data de ontem, conferir o aviso "Essa data já passou…" e que o **Salvar continua habilitado**.
- [ ] **Peça já enviada não é reenviada.** Na campanha Hotseat 18/08, mudar a data da peça `hotseat_anuncio_1808` (a que já saiu à força para 166 grupos) e conferir em `/disparos` que **nenhum envio novo** foi criado para os grupos que já receberam.
- [ ] **O botão visível.** Abrir a campanha na trilha Grupos: o "+ nova peça" tem de aparecer no cabeçalho, **sem rolar**. Clicar nele tem de rolar a tela até o formulário, com o formulário aberto.
- [ ] **O botão não aparece onde não deve.** Trocar para a trilha API individual: o "+ nova peça" some (o "limpar trilha" continua).

## Riscos conhecidos (do spec, não são bugs a corrigir aqui)

- **Data editada não sobrevive à duplicação da campanha.** `duplicateCampaignAction` recalcula `send_at` a partir dos slots da receita em vez de copiar o valor da peça. Editar uma data e depois duplicar devolve o horário padrão da receita.
- **Bug preexistente, agora alcançável, na duplicação.** Essa mesma recalculação casa peça com slot da receita **por posição na lista** (`gruposSlots[idx]`). Desde que passou a ser possível excluir e criar peças, as posições desalinham: duplicar depois de excluir uma peça do meio dá data e código de mensagem errados nas peças seguintes, em silêncio. Merece spec próprio.
- **Fuso.** O campo é lido e gravado como texto local, sem conversão, como o resto da agenda editorial. Quem abrir o app fora do horário de Brasília vê e digita o horário de Brasília — que é o correto para este produto, e o que `BR_OFFSET` já assume.
