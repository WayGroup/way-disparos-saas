# Criação de receitas mais intuitiva

**Data:** 2026-07-15
**Status:** aprovado, aguardando plano de implementação

## Problema

Montar uma receita hoje é confuso e produz dado errado:

1. **O rótulo do offset é texto livre e decorativo.** O slot tem três campos de tempo:
   `offset_label` (texto, ex. "+1 dia"), `offset_days` (número) e `offset_time` (texto).
   Quem agenda é `computeSendAt(âncora, offset_days, offset_time)` — o rótulo é só
   exibição. Nada mantém os dois em sincronia, e **eles já divergiram em produção**:

   | receita | slot | rótulo | `offset_days` real | efeito |
   |---|---|---|---|---|
   | Promo via API | Reforço / prova | `+1 dia` | `0` | dispara na data-âncora |
   | Promo via API | Última chamada | `+2 dias` | `0` | dispara na data-âncora |
   | Webinário (API) | `D0 · 19h07 (ao vivo)` | — | `offset_time` vazio | usa a hora da âncora |

2. **Receita nova nasce vazia.** `createRecipeAction` insere só a linha de `recipes`
   (`app/(app)/receitas/actions.ts`) — sem nenhum input. A pessoa monta do zero,
   inclusive o input-âncora, sem o qual o agendamento não funciona.

3. **A linha do slot é ilegível.** Oito campos num grid de 12 colunas
   (`recipe-editor.tsx`), com Offset, Código, Dias e Hora ocupando **uma coluna cada**.

4. **`code` é mais um campo manual** que quase sempre poderia sair do papel do slot.

5. **Slot novo nasce sem contexto** — dia 0, hora vazia — obrigando preencher tudo.

## Decisões (do brainstorming)

- Escopo é o **núcleo**: itens ①②③④⑥ abaixo. Ficam **fora**: ordenação cronológica dos
  slots, duplicar receita, e backfill dos slots divergentes no banco.
- O backfill é dispensável porque, com o rótulo derivado, o editor passa a **mostrar a
  verdade** (`D0`) nos slots divergentes; ajustar os dias e salvar corrige o registro.
- Formato do rótulo derivado segue a convenção que já existe na receita "Webinário":
  `D-1 · 14h`, `D0 · 09h`, `D0 · 19h07`, `D+2`.

## Não-objetivos

- Sem migration — as colunas `offset_label`, `offset_days`, `offset_time`, `code` já existem.
- Sem tocar no envio, na fila, na geração de campanha ou no prompt.
- Não remover a coluna `offset_label`: ela continua sendo gravada (agora derivada) e é
  lida pelo prompt de geração (`describeSlots`) e pela exibição.
- Sem ordenação automática dos slots, sem duplicar receita, sem backfill no banco.

## Escopo

### ① Rótulo derivado de Dias + Hora

- O input de texto "Offset" **sai** do editor.
- A pessoa preenche **Dias** (number, negativo = antes da âncora) e **Hora**
  (`<input type="time">`, substituindo o texto livre atual).
- O rótulo é calculado por `formatOffsetLabel(days, time)` e exibido como **chip
  read-only** no topo do card do slot.
- Ao salvar, o valor derivado é gravado em `offset_label` (o editor monta o `SaveSlot`
  com `offset_label: formatOffsetLabel(s.offset_days, s.offset_time)`).

**Regras de `formatOffsetLabel(days: number, time: string): string`:**
- Parte do dia: `D0` quando `days === 0`; `D-3` quando negativo; `D+2` quando positivo.
- Parte da hora, só quando `time` casar com `HH:mm`: ` · ${HH}h` se os minutos forem
  `00`, senão ` · ${HH}h${mm}`.
- `time` vazio ou inválido → só a parte do dia.
- Exemplos: `(-1, "14:00") → "D-1 · 14h"`; `(0, "09:00") → "D0 · 09h"`;
  `(0, "19:07") → "D0 · 19h07"`; `(2, "") → "D+2"`; `(0, "") → "D0"`.

### ② Receita nova nasce com os campos padrão

`createRecipeAction` (`app/(app)/receitas/actions.ts`), após inserir a receita, insere
também dois `recipe_inputs`:

| label | field_type | required | is_anchor | sort_order |
|---|---|---|---|---|
| Nome interno | `texto` | `true` | `false` | 0 |
| Data e hora do evento | `data_hora` | `true` | **`true`** | 1 |

Se a inserção dos inputs falhar, a receita criada é removida (rollback compensatório) e
o erro propaga — não deixar receita órfã sem âncora.

### ③ Layout do slot legível

O card de cada slot (`recipe-editor.tsx`) passa de uma linha de 8 campos para duas
linhas, com um cabeçalho:

- **Cabeçalho:** índice do slot dentro da trilha (`#1`, `#2`…), o **chip do rótulo
  derivado**, e o botão `remover` à direita.
- **Linha A:** `Papel / objetivo` (col-span-7) · `Dias` (col-span-2) · `Hora` (col-span-3).
- **Linha B:** `Mídia sugerida` (col-span-6) · `Categoria Meta` (api) ou `Comunidades`
  (grupos) (col-span-3) · `Código` (col-span-3, mono).

### ④ Código derivado do papel

- O input `Código` ganha como **placeholder** o slug do papel
  (`codeFromRole(role)`), para a pessoa ver o que será gravado.
- Ao salvar, todo slot com `code` vazio (após `trim`) recebe `codeFromRole(role)`.
- `codeFromRole(role: string): string` reusa `slugifyIdentifier` de `@/lib/text`.

### ⑥ Slot novo com padrão inteligente

Ao clicar em "+ Adicionar slot", o novo slot herda o tempo do **último slot da mesma
trilha**, via `nextSlotDefaults(last)`:

- `last` existe → `{ offset_days: last.offset_days, offset_time: last.offset_time || "10:00" }`
- `last` ausente (primeiro slot da trilha) → `{ offset_days: 0, offset_time: "10:00" }`

Os demais campos do slot novo seguem como hoje (`role` "Novo toque"/"Novo post",
`code` vazio, `meta_category`/`target_communities` conforme a trilha), exceto
`offset_label`, que passa a ser derivado.

### Helpers puros — `lib/recipe-slots.ts` (novo)

- `formatOffsetLabel(days: number, time: string): string` (①)
- `codeFromRole(role: string): string` (④)
- `nextSlotDefaults(last: { offset_days: number; offset_time: string } | undefined): { offset_days: number; offset_time: string }` (⑥)

## Componentes tocados

| Arquivo | Mudança |
|---|---|
| `lib/recipe-slots.ts` + teste (novos) | os três helpers puros (①④⑥) |
| `app/(app)/receitas/actions.ts` | inputs padrão em `createRecipeAction` (②) |
| `app/(app)/receitas/[id]/_components/recipe-editor.tsx` | rótulo derivado, layout em duas linhas, hora como `type="time"`, código placeholder, slot novo inteligente (①③④⑥) |

## Verificação

- **Unidade (TDD):** `formatOffsetLabel` (os 5 exemplos acima + hora inválida),
  `codeFromRole` (papel → slug; vazio → vazio), `nextSlotDefaults` (com e sem último
  slot; último com hora vazia → `10:00`). Suíte inteira verde + `tsc` limpo.
- **Manual (visual):** criar uma receita nova e conferir que ela já vem com **Nome
  interno** e **Data e hora do evento (âncora)**; adicionar dois slots e ver o segundo
  herdar dia/hora do primeiro; mudar Dias/Hora e ver o chip do rótulo acompanhar;
  deixar o Código vazio, salvar e conferir que gravou o slug do papel; abrir a "Promo
  via API" e confirmar que os slots divergentes agora exibem `D0` (a verdade).

## Riscos

- **O rótulo derivado muda o que aparece nas receitas existentes.** Slots divergentes
  passam a exibir o valor real (ex. `D0` em vez de `+1 dia`). É o comportamento
  desejado (revela o erro), mas é uma mudança visível — sinalizada na verificação manual.
- **Gravar o rótulo derivado no save** sobrescreve rótulos escritos à mão que fossem
  mais descritivos (ex. `D0 · 19h07 (ao vivo)` perde o sufixo "(ao vivo)"). Aceito: a
  informação de tempo continua correta e o papel do slot já carrega a semântica.
- **`code` derivado no save** pode gerar códigos longos (o slug do papel inteiro). A
  pessoa vê o placeholder antes de salvar e pode encurtar.
