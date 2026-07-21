# Hora relativa ao evento nos slots de receita

**Data:** 2026-07-15
**Status:** aprovado, aguardando plano de implementação

## Problema

No slot de receita, o **dia** é relativo à âncora (`offset_days = -1`) mas a **hora** é
absoluta (`offset_time = "10:00"`). Se a hora do evento mudar, todo slot pensado como
"X antes do evento" fica errado — em silêncio.

Exemplo real: na receita "Webinário (aula ao vivo)", a live começa 19h07 e há posts
gravados em `19h20`, `19h40`, `20h00`. Eles são, na intenção, "+13min", "+33min" e
"+53min" do início. Mova a live para 21h e os três disparam antes dela.

Meio caminho já existe: `computeSendAt` ([schedule.ts:6-12](../../../lib/schedule.ts))
parte da hora **do evento** e só a sobrescreve quando `offset_time` está preenchido —
ou seja, **hora vazia já significa "na mesma hora do evento"**. Falta poder deslocar a
partir dela.

## Decisões (do brainstorming)

- A hora do slot passa a ter **dois modos**: **relativa ao evento** (deslocamento em
  horas + minutos) e **hora fixa** (o comportamento atual, que segue útil para avisos
  em horário civilizado independentemente do evento).
- Granularidade **horas + minutos** (o caso real exige `+13min`, não só horas).
- Um **único `<select>`** escolhe o modo **e** o sinal: `hora fixa` / `antes do evento` /
  `depois do evento`. Horas e minutos são sempre positivos — sem campo negativo, sem
  ambiguidade de sinal.
- O campo **Dias permanece**: `D-1` + `na hora` significa **24h antes** (mesmo horário,
  um dia antes).
- Peças criadas pelo **refino** continuam com hora absoluta (a IA não devolve offset
  relativo) — usam o default `0`.

## Não-objetivos

- Não remover o modo de hora fixa.
- Não mexer no envio, na fila, no worker nem no prompt da IA.
- Não fazer a IA gerar offsets relativos.
- Não alterar `campaign_touches`/`campaign_group_posts`: a peça continua guardando um
  `send_at` absoluto, calculado uma vez na geração.

## Escopo

### ① Migration `0023_offset_minutes.sql`

```sql
alter table public.recipe_slots
  add column if not exists offset_minutes int not null default 0;
```

Semântica: deslocamento em minutos a partir da **hora do evento**; negativo = antes.
Só se aplica quando `offset_time` está **vazio** (modo relativo); com hora fixa, o
`offset_time` manda e este campo é ignorado. Default `0` = "na hora do evento", que é
exatamente o comportamento atual → **migration retrocompatível**, nenhum slot muda.

A mesma migration recria a função `save_recipe` (`create or replace`), que hoje lista as
colunas dos slots uma a uma em três pontos ([0010](../../../supabase/migrations/0010_save_recipe_rpc.sql)):
a lista de colunas do `insert`, a lista do `select` e a definição do `jsonb_to_recordset`
(+ o alias do `with ordinality`). `offset_minutes` entra nos três, com `coalesce(...,0)`.

### ② `computeSendAt` — `lib/schedule.ts`

Assinatura ganha um quarto parâmetro **com default**, para os 6 pontos que a chamam
continuarem compilando:

```ts
computeSendAt(anchor: string, offsetDays: number, offsetTime: string, offsetMinutes = 0): string
```

Comportamento:
1. Aplica `offsetDays` na data.
2. Se `offsetTime` for `HH:mm` válido → fixa a hora (comportamento atual).
3. Senão, se `offsetMinutes !== 0` → desloca a partir da hora do evento. O deslocamento
   **rola o dia** naturalmente (evento 00:30 com −60min → 23:30 do dia anterior).
4. Formata a data resultante.

Com `offsetMinutes = 0` o resultado é idêntico ao de hoje nos dois modos.

### ③ Rótulo derivado — `lib/recipe-slots.ts`

`formatOffsetLabel(days: number, time: string, offsetMinutes = 0): string`:

- Com `time` válido → `D-1 · 14h` / `D0 · 19h07` (como hoje).
- Sem `time`, lê o deslocamento em português:
  - `0` → `na hora`
  - `|m| < 60` → `13min depois` / `30min antes`
  - múltiplo de 60 → `1h antes` / `2h depois`
  - resto → `1h30 antes` (minutos com dois dígitos)

Exemplos completos: `D0 · na hora`, `D0 · 1h antes`, `D0 · 13min depois`,
`D-1 · 1h30 antes`, `D-1 · 10h`.

Dois helpers novos para a UI:
- `splitOffsetMinutes(total: number): { sign: "antes" | "depois"; hours: number; minutes: number }`
  (total `0` → `sign: "antes"`, `0h 0min`).
- `joinOffsetMinutes(sign: "antes" | "depois", hours: number, minutes: number): number`.

E `nextSlotDefaults` passa a devolver também `offset_minutes`, para o slot novo herdar
o "quando" inteiro do anterior da trilha.

### ④ Tipos

- `RecipeSlot.offset_minutes: number` (`lib/db/types.ts`)
- `SaveSlot.offset_minutes: number` (`app/(app)/receitas/actions.ts`)

O campo é obrigatório no tipo, então as fixtures de teste que constroem `RecipeSlot`
passam a precisar dele.

### ⑤ Editor — `recipe-editor.tsx`

O card do slot passa a ter **três linhas**, com todo o "quando" agrupado numa só:

- **Linha A (identidade):** `Papel / objetivo` (col-12).
- **Linha B (quando):** `Dias` (col-3) · `Quando` (`<select>`, col-4) · controles do
  modo (col-5):
  - `hora fixa` → `<input type="time">`
  - `antes do evento` / `depois do evento` → `Horas` + `Minutos` (números ≥ 0)
- **Linha C (detalhes):** `Mídia sugerida` (col-6 na api / col-9 em grupos) ·
  `Categoria Meta` (col-3, só api) · `Código` (col-3)

Regras do `<select>`:
- Valor derivado do estado: `offset_time` preenchido → `fixa`; senão
  `offset_minutes > 0` → `depois`; senão → `antes`.
- Mudar para `fixa`: grava `offset_time = "10:00"` (padrão sensato).
- Mudar para `antes`/`depois`: limpa `offset_time` (`""`) e ajusta o **sinal** de
  `offset_minutes` mantendo a magnitude.
- Os inputs de horas/minutos escrevem via `joinOffsetMinutes` com o sinal do select.

Hidratação e slot novo passam a carregar `offset_minutes`.

### ⑥ Geração e duplicação — `app/(app)/campanhas/actions.ts`

As **4** chamadas que partem de slots de receita passam o novo valor
(`slot?.offset_minutes ?? 0`): geração (api e grupos) e duplicação (api e grupos).
As 2 chamadas do refino (peças novas vindas da IA) seguem com 3 argumentos.

## Componentes tocados

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/0023_offset_minutes.sql` (novo) | coluna + `save_recipe` recriada (①) |
| `lib/schedule.ts` | 4º parâmetro e deslocamento com virada de dia (②) |
| `lib/recipe-slots.ts` + teste | rótulo relativo, `splitOffsetMinutes`, `joinOffsetMinutes`, `nextSlotDefaults` (③) |
| `lib/schedule.test.ts` | casos do deslocamento relativo (②) |
| `lib/db/types.ts` · `app/(app)/receitas/actions.ts` | `offset_minutes` nos tipos (④) |
| `lib/ai/prompt.test.ts` | fixtures de `RecipeSlot` ganham o campo (④) |
| `app/(app)/receitas/[id]/_components/recipe-editor.tsx` | card em 3 linhas + select de modo (⑤) |
| `app/(app)/campanhas/actions.ts` | 4 chamadas passam `offset_minutes` (⑥) |

## Verificação

- **Unidade (TDD):** `computeSendAt` — deslocamento negativo, positivo, virada de dia
  para trás e para frente, e igualdade com o comportamento atual quando `offsetMinutes = 0`
  (nos dois modos). `formatOffsetLabel` — os cinco formatos do rótulo relativo.
  `splitOffsetMinutes`/`joinOffsetMinutes` — ida e volta, inclusive `0`.
- **Migration:** aplicar a `0023` e conferir a coluna e a nova `save_recipe`
  (salvar uma receita pelo editor sem erro).
- **Manual (visual):** num slot, escolher `antes do evento` + `1h 0min` e ver o chip
  virar `D0 · 1h antes`; trocar para `hora fixa` e ver o `type="time"` voltar; salvar e
  reabrir mantendo a escolha. Gerar uma campanha e conferir que a peça caiu 1h antes da
  âncora; mudar a âncora, duplicar, e conferir que ela **acompanhou** o novo horário.

## Riscos

- **`computeSendAt` alimenta o `send_at` de toda peça.** A refatoração precisa preservar
  o resultado exato nos dois caminhos atuais — coberto por testes de igualdade com
  `offsetMinutes = 0`.
- **Recriar `save_recipe`** é a parte mais delicada da migration: se a lista de colunas
  divergir entre `insert`, `select` e `jsonb_to_recordset`, o salvamento quebra. Conferir
  salvando uma receita real após aplicar.
- **Campo obrigatório novo em `RecipeSlot`** quebra fixtures de teste até serem
  atualizadas — tratado no plano, não deixado para o typecheck descobrir.
