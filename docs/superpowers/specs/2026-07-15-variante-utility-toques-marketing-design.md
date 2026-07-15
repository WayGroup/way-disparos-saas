# Variante UTILITY nos toques MARKETING

**Data:** 2026-07-15
**Status:** aprovado, aguardando plano de implementação

## Problema

Na trilha API, cada toque tem **uma** categoria Meta só (`meta_category` = UTILITY
**ou** MARKETING) e um único `template_body`. Ao submeter um template MARKETING ao Meta,
o custo é maior e a aprovação mais rígida. O usuário quer, para **todo toque MARKETING**,
ter também uma **versão UTILITY** pronta do mesmo recado — pra tentar submeter como
UTILITY (mais barato, passa mais fácil) e cair pra MARKETING só se precisar.

Hoje isso não existe: a IA gera uma versão por toque.

## Decisões (do brainstorming)

- **Cobertura:** só os toques **MARKETING** ganham a alternativa (uma versão UTILITY).
  Toque que já é UTILITY não muda. A trilha Grupos não muda (lá não há categoria Meta).
- **A alternativa é completa:** corpo reescrito **+ botões próprios** (transacionais) **+**
  seu próprio aviso de risco de reclassificação. Não é só o texto.
- **Modelada como um objeto único** (`utility_alt` jsonb), coerente com o resto do
  toque (`buttons`/`window_steps` já são jsonb).

## Não-objetivos

- Sem "seleção" de qual versão é a oficial: a trilha API é manual (o usuário copia o
  template pro sistema do Meta). O card só mostra as duas com botão copiar.
- Não gerar alternativa MARKETING para toques UTILITY (direção única: MARKETING → UTILITY).
- Não tocar na trilha Grupos, na fila, nem no caminho de envio.
- Edição manual dos **botões** da alternativa fica para o refino/regeneração (como a
  janela 24h já é hoje); o Editar cobre só o **corpo** da alternativa.

## Escopo

### ① Modelo — migration `0022_utility_alt.sql`

Adicionar a `campaign_touches`:

```sql
alter table public.campaign_touches
  add column if not exists utility_alt jsonb;
```

`null` (default) = toque sem alternativa. Quando presente:

```
{ "template_body": string, "buttons": [{type,text,url}], "risk_flag": boolean }
```

### ② Tipo — `lib/db/types.ts`

`CampaignTouch` ganha:

```ts
utility_alt: {
  template_body: string;
  buttons: { type: "quick_reply" | "url"; text: string; url: string }[];
  risk_flag: boolean;
} | null;
```

### ③ Geração — `lib/ai/schema.ts` + `lib/ai/prompt.ts`

- **Schema:** o item de `touches` ganha `utility_alt` como objeto **nullable**
  (`type: ["object","null"]`, `additionalProperties:false`, com `required`
  `["template_body","buttons","risk_flag"]` e as mesmas `properties` de `buttons` já
  usadas no toque). `utility_alt` entra no `required` do toque (a IA sempre devolve a
  chave; valor `null` quando não se aplica).
- **Prompt (`SYSTEM_PROMPT`):** regra nova — para **todo toque MARKETING**, gerar
  `utility_alt`: o **mesmo recado** reescrito em enquadramento **UTILITY** (transacional
  e informativo — foca na informação e na expectativa que o lead já tem, sem gatilho
  promocional explícito, sem oferta/urgência), com **botões transacionais** ("Ver
  detalhes", "Confirmar", "Abrir" — nunca "Quero a vaga"/"Comprar"), e `risk_flag=true`
  quando a versão ainda soar promocional demais para passar como UTILITY. Para toque
  **UTILITY**, `utility_alt` = `null`.
- **Insert da geração:** nenhuma mudança — `content.touches.map((t) => ({ ...t, ... }))`
  ([actions.ts:96](../../../app/(app)/campanhas/actions.ts)) já espalha `utility_alt`.

### ④ Refino — `lib/ai/refine-schema.ts`, `lib/ai/refine.ts`, `lib/ai/refine-prompt.ts`

- **Schema:** `utility_alt` (mesmo objeto nullable) entra nos itens de `touch_updates`
  **e** `new_touches`, no `required` de cada.
- **Tipos:** `TouchUpdate` e `NewTouch` ganham `utility_alt` (mesmo shape do tipo em ②).
- **Prompt (`buildRefinePrompt`):** listar o `utility_alt` de cada toque no estado atual
  e instruir: ao editar/criar um toque MARKETING, manter/gerar a versão UTILITY
  alternativa; toque UTILITY → `null`.
- **Aplicação no `refineCampaignAction`:** nenhuma mudança — updates fazem
  `.update({ ...fields, ... })` e new_touches espalham `...fields`
  ([actions.ts:298,335](../../../app/(app)/campanhas/actions.ts)), então `utility_alt` flui.

### ⑤ UI — `app/(app)/campanhas/[id]/_components/touch-card.tsx`

- **Visualização:** quando `touch.utility_alt` não for `null`, renderizar, logo abaixo do
  bloco "Template · pago", um bloco **"Versão UTILITY · alternativa"** com:
  - o `template_body` da alternativa (`whitespace-pre-wrap`);
  - os `buttons` próprios (mesmo render dos botões do template);
  - o selo **⚠ risco reclassificação** quando `utility_alt.risk_flag`;
  - um **nome sugerido** derivado `utilityAltName(touch.template_name)` (ver ⑦), com
    `CopyButton`;
  - `CopyButton` do corpo da alternativa.
  Estilo consistente com o bloco de template (mesmas classes de seção/lista de botões).
- **Edição:** no modo Editar, quando houver `utility_alt`, um `<textarea>` "Corpo da
  versão UTILITY" ligado ao corpo da alternativa. Ao salvar, `updateTouchAction` grava o
  `utility_alt` com o novo `template_body` (mantendo `buttons`/`risk_flag`). Os botões da
  alternativa se ajustam via refino (fora do Editar), como a janela 24h.
- **Tipos de form:** `TouchFields` ganha `utility_alt` (o objeto ou `null`);
  `updateTouchAction` persiste a coluna.

### ⑥ Duplicar — `app/(app)/campanhas/actions.ts` (`duplicateCampaignAction`)

O insert de toques lista os campos explicitamente
([actions.ts:639-646](../../../app/(app)/campanhas/actions.ts)); adicionar
`utility_alt: t.utility_alt` ao objeto.

### ⑦ Helper — `lib/campaign-touch.ts` (novo)

- `utilityAltName(templateName: string): string` → `${templateName}_util` quando o nome
  não é vazio; `""` quando vazio. Puro e testável.

## Componentes tocados

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/0022_utility_alt.sql` (novo) | coluna `utility_alt jsonb` (①) |
| `lib/db/types.ts` | `CampaignTouch.utility_alt` (②) |
| `lib/ai/schema.ts` + `lib/ai/prompt.ts` | schema nullable + regra de geração (③) |
| `lib/ai/refine-schema.ts` + `refine.ts` + `refine-prompt.ts` | `utility_alt` em updates/new + prompt (④) |
| `app/(app)/campanhas/[id]/_components/touch-card.tsx` | bloco da alternativa + textarea (⑤) |
| `app/(app)/campanhas/actions.ts` | `TouchFields`/`updateTouchAction` + duplicar (⑤,⑥) |
| `lib/campaign-touch.ts` + teste (novo) | `utilityAltName` (⑦) |

## Verificação

- **Unidade:** `utilityAltName` (nome não-vazio → sufixo `_util`; vazio → `""`). Suíte
  inteira verde.
- **Migration:** aplicar `0022` no Supabase e conferir a coluna via `list_tables`.
- **Integração (manual, precisa de `ANTHROPIC_API_KEY`):** gerar uma campanha
  (receita "Webinário quinzenal", que tem toques MARKETING). Conferir: cada toque
  MARKETING mostra o bloco "Versão UTILITY · alternativa" com corpo transacional +
  botões próprios + nome `_util`; toques UTILITY não mostram o bloco; o refino consegue
  regenerar a alternativa; duplicar a campanha preserva as alternativas.

## Riscos

- **Schema maior pode diluir o prompt** — manter a regra do `utility_alt` curta e
  específica; conferir na geração de teste que o template MARKETING principal e os
  botões seguem corretos.
- **`utility_alt` nullable no structured output** — validar na geração real que a IA
  devolve `null` (não objeto vazio) para toques UTILITY; se o modelo tropeçar, tratar
  objeto vazio como "sem alternativa" na UI (renderizar só quando `template_body` não
  for vazio).
- **Migration em produção** — coluna nullable com default `null`, aditiva e segura;
  campanhas existentes ficam com `utility_alt = null` (sem alternativa), coerente.
