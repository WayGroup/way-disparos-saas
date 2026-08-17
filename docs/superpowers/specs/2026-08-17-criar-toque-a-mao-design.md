# Criar toque da API individual à mão

**Data:** 2026-08-17
**Status:** aprovado, aguardando plano de implementação

## Problema

Criar peça à mão existe só na trilha **Grupos** (entregue em 2026-08-14). Na trilha **API
individual**, toques continuam nascendo apenas da geração da campanha ou do chat de refino
— as duas são a IA. Quem quer escrever um toque próprio não tem por onde.

O escopo anterior registrou o motivo do adiamento: "o formulário de um toque da API tem uma
dúzia de campos e é outro projeto". A contagem estava certa, o custo não: **o formulário já
existe** no modo de edição de `touch-card.tsx`, cobrindo rótulo, categoria Meta, papel, nome
do template, corpo, botões (com adicionar e remover), fallback, ação de CRM e sinalizador de
risco. Faltava enxergar isso.

Existe ainda uma lacuna adjacente: **o toque não tem data editável.** `TouchFields` não
inclui `send_at` — exatamente a situação das peças de grupo até hoje de manhã.

## Decisões (do brainstorming)

- **Formulário enxuto na criação**, não paridade com o editor: rótulo, papel, categoria
  Meta, corpo do template e quando enviar. O resto nasce vazio e se preenche no *Editar*,
  que já funciona. Dois formulários grandes divergiriam com o tempo.
- **Editar a data do toque entra junto**, sem ter sido pedido. Criar com data e não poder
  mudá-la depois reproduziria exatamente a reclamação que originou o trabalho de hoje de
  manhã nas peças de grupo. Custa pouco: o campo no tipo e o mesmo aviso já construído.
- **Criar usa dias + hora relativos à âncora; editar usa data e hora absolutas.** A mesma
  assimetria — e pelo mesmo motivo — das peças de grupo: criar é encaixar na régua da
  campanha, editar é mover uma peça específica.
- **O botão "+ nova peça" do cabeçalho passa a valer nas duas trilhas**, abrindo o
  formulário certo para cada uma.

## Fatos do código que sustentam o desenho

Verificados antes de desenhar; o desenho depende deles:

- **Toque nunca entra na fila.** `buildGroupPieces` só monta a trilha Grupos, e
  `updateTouchAction` não chama `rescheduleCampaign` enquanto `updateGroupPostAction` chama.
  Portanto criar, editar ou datar um toque **não mexe em envio nenhum**. Data de toque é
  agenda editorial pura.
- **Todas as colunas de `campaign_touches` têm valor padrão no banco**: `buttons` e
  `window_steps` em `'[]'::jsonb`, `fallback_copy`/`crm_action` em `''`, `risk_flag` em
  `false`, `utility_alt` nulo, `template_name` e `send_at` em `''`. O insert só precisa
  escrever o que o formulário enxuto coleta — os demais campos nascem vazios sozinhos.
- **O refino já cria toque** com `template_name: buildCode(recipeType, slugCode(role),
  anchor)` e `send_at: computeSendAt(anchor, offset_days, offset_time)`. A criação à mão usa
  exatamente a mesma derivação, para que um toque feito à mão seja indistinguível de um da IA.
- **A âncora** vem do input da receita marcado `is_anchor` cruzado com os valores da
  campanha, e já chega no cliente via a prop `anchor` de `CampaignView`.
- **`avisoDeData(sendAt, now)`** já existe em `lib/schedule.ts`, com os quatro estados
  (vazio, inválida, passada, ok) e testes. O editor do toque reusa sem alterar.

## Não-objetivos

- **Sem migration.** Todas as colunas já existem.
- Sem paridade do formulário de criação com o de edição — botões, fallback, CRM e risco
  ficam para o *Editar*.
- Sem editar `window_steps` (a janela de 24h) nem `utility_alt` na criação: os dois
  continuam saindo só do chat de refino, como o próprio editor já declara na tela.
- Sem tocar em `rescheduleCampaign`, `buildGroupPieces` ou qualquer coisa da fila — toque
  não gera envio.
- Sem mexer no formulário de criação de peça de grupo (`new-group-post-form.tsx`).
- **Não corrigir o desalinhamento da duplicação** — permanece registrado como risco em
  `2026-08-17-editar-data-e-achar-o-criar-design.md`, agora com medição: a campanha Hotseat
  tem 10 peças para 14 slots, e 9 delas pegariam a data de outro slot.

## Escopo

### ① Derivação compartilhada — `lib/campaign-manual-post.ts`

`buildManualGroupPost` e a montagem do toque precisam das mesmas três derivações. Copiá-las
seria duplicação literal de bloco de lógica — o tipo de coisa que a revisão barra, com razão.

Extrair, no arquivo que já a contém:

```ts
export function derivarCampos(
  input: { role: string; offset_days: number; offset_time: string },
  ctx: { existing: { sort_order: number }[]; recipeType: string; anchor: string },
): { sort_order: number; code: string; send_at: string };
```

- `sort_order` ← `nextSortOrder(ctx.existing)`
- `code` ← `buildCode(ctx.recipeType, slugCode(input.role), ctx.anchor)`
- `send_at` ← `computeSendAt(ctx.anchor, input.offset_days, input.offset_time)`

`buildManualGroupPost` passa a usá-la, mapeando `code` para `message_code` e mantendo
`pickReferenceGroups` (que é só dele). **Os testes existentes de `buildManualGroupPost`
ficam intocados e têm de continuar passando** — é a prova de que a extração não mudou
comportamento.

### ② Montagem do toque — `lib/campaign-manual-touch.ts` (novo)

```ts
export type ManualTouchInput = {
  offset_label: string;
  role: string;
  meta_category: "UTILITY" | "MARKETING";
  template_body: string;
  /** Negativo = antes da âncora. */
  offset_days: number;
  /** "HH:mm". */
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

export function buildManualTouch(
  input: ManualTouchInput,
  ctx: { existing: { sort_order: number }[]; recipeType: string; anchor: string },
): ManualTouchDraft;
```

Usa `derivarCampos` e mapeia `code` para `template_name`. Não devolve os campos com padrão
de banco — quem não é escrito nasce vazio.

Testes: numeração a partir da maior existente, primeira peça de trilha vazia, nome do
template derivado do papel e da âncora, data derivada, âncora vazia deixando data vazia, e
passagem literal dos campos digitados.

### ③ Ação — `app/(app)/campanhas/actions.ts`

**`createTouchAction(campaignId: string, input: ManualTouchInput): Promise<void>`**

1. Valida: `role` e `template_body` vazios lançam com mensagem em PT-BR, antes de qualquer
   escrita.
2. Carrega campanha e receita, resolve a âncora como `refineCampaignAction` já faz.
3. `buildManualTouch(input, { existing: campaign.touches, recipeType, anchor })`.
4. `insert` em `campaign_touches` com `campaign_id` mais o draft.
5. `revalidatePath`. **Sem `rescheduleCampaign`** — toque não entra na fila.

**`TouchFields` ganha `send_at: string`.** `updateTouchAction` não muda em mais nada: ela já
grava o objeto inteiro, e continua sem replanejar.

### ④ O editor do toque — `touch-card.tsx`

- O estado inicial passa a carregar `send_at: touch.send_at`.
- Entre a ação de CRM e o checkbox de risco, um `<input type="datetime-local">` rotulado
  **"Data e hora do envio (horário de Brasília)"**, alimentado por `toDatetimeLocal` e
  gravado com `fromDatetimeLocal`.
- Abaixo dele, `avisoDeData(f.send_at, new Date())` renderizado quando não vazio, em
  `text-risk`. **Não bloqueia o Salvar**, pela mesma razão de sempre.

**Uma diferença em relação à peça de grupo:** as frases de `avisoDeData` mencionam que "os
envios já agendados dela são cancelados". Para toque isso é falso — ele nunca teve envio.

A função passa a ser:

```ts
export function avisoDeData(sendAt: string, now: Date, geraEnvio: boolean): string;
```

`geraEnvio` é **obrigatório, sem valor padrão** — assim o compilador cobra os dois call
sites e ninguém cai no comportamento errado por esquecimento. A oração "Os envios já
agendados dela são cancelados." só é acrescentada quando `geraEnvio` é `true`. O cartão da
peça de grupo passa `true`, o do toque passa `false`. **As frases vistas hoje nas peças de
grupo não mudam em nada.**

### ⑤ Formulário — `app/(app)/campanhas/[id]/_components/new-touch-form.tsx` (novo, client)

Cartão inline no estilo do modo de edição do `TouchCard`. Campos: rótulo, papel, categoria
Meta (select UTILITY/MARKETING), corpo do template, dias (inteiro, negativo = antes) e hora
(`HH:mm`). Abaixo dos campos de data, a data resultante calculada da âncora.

Salvar chama `createTouchAction` e fecha; erro aparece dentro do cartão. Botão desabilitado
enquanto papel ou corpo estiverem vazios.

O campo de dias usa `type="text"` com `inputMode="numeric"` e guarda a string, convertendo
só ao salvar — o mesmo que o formulário de peça de grupo faz, porque `type="number"`
descarta o sinal de menos enquanto se digita.

### ⑥ Os botões — `campaign-view.tsx`

- O **"+ nova peça"** do cabeçalho deixa de exigir `track === "grupos"` e passa a aparecer
  nas duas trilhas, abrindo o formulário da trilha ativa.
- A trilha API ganha o botão tracejado no fim da lista, gêmeo do que a trilha Grupos já tem.
- O modal de *limpar trilha* tem uma frase que deixa de ser verdade: "Só o chat de refino
  recria peças desta trilha — não existe criar toque à mão." **Remover essa frase.**

## Componentes tocados

| Arquivo | Mudança |
|---|---|
| `lib/campaign-manual-post.ts` | extrai `derivarCampos` (①) |
| `lib/campaign-manual-touch.ts` (novo) | `buildManualTouch` (②) |
| `lib/campaign-manual-touch.test.ts` (novo) | testes da montagem (②) |
| `lib/schedule.ts` | `avisoDeData` ganha o parâmetro de "gera envio" (④) |
| `lib/schedule.test.ts` | casos do parâmetro novo (④) |
| `app/(app)/campanhas/actions.ts` | `createTouchAction`; `send_at` em `TouchFields` (③) |
| `app/(app)/campanhas/[id]/_components/touch-card.tsx` | campo de data + aviso (④) |
| `app/(app)/campanhas/[id]/_components/new-touch-form.tsx` (novo) | o formulário (⑤) |
| `app/(app)/campanhas/[id]/_components/campaign-view.tsx` | botões nas duas trilhas; frase do limpar trilha (⑥) |

## Verificação

- **Unidade** (`npm test`): `buildManualTouch` e os casos novos de `avisoDeData`. Os testes
  de `buildManualGroupPost` continuam passando **sem alteração** — prova de que extrair
  `derivarCampos` não mudou comportamento.
- **Typecheck** (`npx tsc --noEmit`) verde.
- **Manual, criar:** na trilha API individual, "+ nova peça" no cabeçalho → preencher papel,
  categoria, corpo, dias e hora → a prévia mostra a data → criar. O toque aparece na lista
  com nome de template no mesmo padrão dos outros, e no Calendário na data certa. Abrir o
  *Editar* dele e conferir que botões, fallback e CRM estão vazios e editáveis.
- **Manual, editar a data:** mudar a data de um toque existente pelo *Editar*, salvar, e
  conferir que o cabeçalho e o Calendário refletem. Conferir que **nada muda em
  `/disparos`** — toque não gera envio.
- **Manual, os avisos:** no toque, limpar a data e pôr uma data passada; os avisos aparecem
  e **não** mencionam envios cancelados. Na peça de grupo, os mesmos casos **continuam**
  mencionando.
- **Manual, o botão nas duas trilhas:** o "+ nova peça" aparece nas duas e abre o formulário
  certo em cada uma.

## Riscos

- **Extrair `derivarCampos` mexe em código que já funciona e tem teste.** Mitigado por os
  testes existentes de `buildManualGroupPost` não poderem ser alterados: se a extração mudar
  comportamento, eles quebram.
- **`avisoDeData` ganha um parâmetro e é usada em dois lugares.** Se o parâmetro tiver
  default, um chamador esquecido cai silenciosamente no comportamento errado. O plano deve
  torná-lo **obrigatório**, para o compilador cobrar os dois call sites.
- **Toque criado à mão em campanha sem âncora** nasce sem data — existe, mas some do
  Pipeline e do Calendário, que se organizam por data. Mesmo comportamento das peças de
  grupo, e o aviso de "sem data" fica visível no editor.
- **Nada aqui toca a fila.** É a propriedade que torna esta entrega de baixo risco: nenhum
  caminho novo cria, cancela ou reagenda envio.
