# Peças de campanha: Janela 24h contínua + mídia sob demanda

**Data:** 2026-07-15
**Status:** aprovado, aguardando plano de implementação

## Problema

Ao usar a ferramenta para criar campanhas, três incômodos apareceram:

1. **Janela 24h desconexa.** Na trilha API, os passos da "Janela 24h · grátis"
   (`window_steps`) são gerados pela IA de forma isolada, sem retomar o template
   que abriu a janela. O conjunto lê como conversas separadas em vez de um fluxo
   contínuo que evolui a partir da mensagem inicial.
2. **Anexo de mídia em toda peça.** O `MediaPicker` é renderizado em todo post e
   todo passo de janela, mesmo nas peças que são só-texto. Ruído visual e a falsa
   sensação de que toda peça precisa de mídia.
3. **Sugestão de mídia rasa.** Hoje o campo `media`/`suggested_media` é um rótulo
   de 3 palavras ("Vídeo case"). Não diz o que a mídia deve **conter**, então não
   serve de roteiro para quem vai produzi-la.

## Decisões (do brainstorming)

- Ponto #1 é especificamente a **Janela 24h da trilha API**, e o buraco está na
  **geração** (a IA escreve solto) — não na apresentação nem na falta de papéis
  por passo. Conserto: prompt.
- Ponto #2: nas peças só-texto o anexo é **escondido por completo**. O campo de
  sugestão de mídia passa a ser o interruptor: tem briefing → peça-com-mídia
  (mostra anexo); vazio → só-texto (sem anexo). Para transformar uma só-texto em
  peça-com-mídia, edita-se a sugestão (affordance que já existe no "Editar").
- Ponto #3: a sugestão vira um **briefing em texto corrido** — um roteiro de
  produção (formato, duração, o que mostrar/dizer, mensagem-chave, tom). Gerado
  pela IA, editável.

## Não-objetivos

- **Sem migration.** As colunas `campaign_group_posts.media`,
  `recipe_slots.suggested_media` e o `media` dentro de `campaign_touches.window_steps`
  já são `text`/string. O briefing mais longo cabe sem mudança de schema.
- **Sem mexer no envio.** O briefing é uma sugestão editorial; o que sai no
  disparo continua sendo `payload` (texto + `asset_id` anexado). Nada aqui altera
  a fila, o jitter ou a validação de envio.
- **Sem reescrever as receitas-seed.** Como o prompt manda a IA *expandir* a dica
  do slot num briefing, os `suggested_media` curtos das seeds seguem válidos.
- **Sem "papel por passo" na Janela 24h.** Considerado e descartado no
  brainstorming — a continuidade vem da costura narrativa, não de rótulos por passo.

## Escopo

### ① Janela 24h que flui do template (trilha API) — geração

O `SYSTEM_PROMPT` ([lib/ai/prompt.ts:8](../../../lib/ai/prompt.ts)) já separa
template (pago) de janela (grátis), mas não instrui a **costurar** os passos.

Adicionar regra explícita ao prompt de geração e ao de refino: cada `window_step`
continua a *thread* do `template_body` do mesmo toque —

- mesma voz (Lucas, 1ª pessoa) e mesmo tema/promessa da mensagem inicial;
- retoma o que o template disse (não reabre a conversa do zero);
- os passos progridem entre si (passo 1 → passo 2 → passo 3), escalando rumo ao
  CTA do papel do toque.

A mesma instrução precisa existir no caminho de **refino** (`lib/ai/refine.ts` /
`lib/ai/refine-schema.ts`), senão regenerar uma peça perde a continuidade.

Sem mudança de schema: o schema já gera `window_steps: {media, caption}[]` dentro
do mesmo objeto do toque, então a IA tem o `template_body` à vista.

### ② Anexo só nas peças que pedem mídia — UI

Regra única: **o `MediaPicker` só aparece quando a peça tem briefing de mídia**
(o campo `media` não-vazio).

- **Post de grupo** ([post-card.tsx:71](../../../app/(app)/campanhas/[id]/_components/post-card.tsx)):
  renderizar o `MediaPicker` apenas quando `post.media` for não-vazio.
- **Passo de janela (toque API)** ([touch-card.tsx:100](../../../app/(app)/campanhas/[id]/_components/touch-card.tsx)):
  renderizar o `MediaPicker` do passo apenas quando `step.media` for não-vazio.
- **Virar só-texto → com-mídia:** já é possível pelo "Editar" do post (preenche
  "Mídia sugerida" → salva). Na trilha API a mídia da janela é ajustada pelo chat
  de refino (comportamento atual, mantido).
- **`mediaMissing` dos toques** ([campaign-pieces.ts:224](../../../lib/campaign-pieces.ts)):
  hoje é `window_steps.some(s => !s.asset_id)`, o que marca "Falta mídia" até em
  passos só-texto. Passa a `window_steps.some(s => s.media && !s.asset_id)`.
  O `mediaMissing` do post ([campaign-pieces.ts:252](../../../lib/campaign-pieces.ts))
  já é `!!p.media && !p.asset_id` — correto, mantido.

### ③ Sugestão de mídia vira briefing em texto — geração + UI

**Geração:** no prompt, o campo `media` (de `window_steps` e de `group_posts`)
deixa de ser rótulo e passa a ser um briefing curto porém completo — formato,
duração aproximada, o que aparece/se diz, mensagem-chave e tom. O schema segue
`string` (coluna já é `text`).

**UI:**
- No `MediaPicker` ([media-picker.tsx:65](../../../app/(app)/campanhas/[id]/_components/media-picker.tsx)),
  a linha minúscula `Sugestão: {suggestion}` vira um **bloco de briefing** legível
  (multilinha, `whitespace-pre-wrap`), visível **inclusive depois de anexar** — pra
  conferir se o arquivo bate com o pedido. (Hoje só aparece quando não há asset.)
- No modo Editar do post ([post-card.tsx:131](../../../app/(app)/campanhas/[id]/_components/post-card.tsx)),
  o `<input>` "Mídia sugerida" vira `<textarea>`.

## Componentes tocados

| Arquivo | Mudança |
|---|---|
| `lib/ai/prompt.ts` | regra de continuidade da Janela 24h (①) + briefing de mídia (③) |
| `lib/ai/refine.ts` / `lib/ai/refine-schema.ts` | espelhar a regra de continuidade (①) |
| `app/(app)/campanhas/[id]/_components/post-card.tsx` | gate do anexo (②) + textarea do briefing (③) |
| `app/(app)/campanhas/[id]/_components/touch-card.tsx` | gate do anexo por passo (②) |
| `app/(app)/campanhas/[id]/_components/media-picker.tsx` | bloco de briefing legível (③) |
| `lib/campaign-pieces.ts` | `mediaMissing` dos toques ignora passos só-texto (②) |

## Verificação

- **②** é lógica pura testável: unit em `lib/campaign-pieces.test.ts` cobrindo o
  novo `mediaMissing` (passo só-texto não acusa falta; passo com briefing e sem
  asset acusa) e o comportamento de gate. Toda a suíte (`npx vitest run`) verde.
- **① e ③** são qualidade de prompt — verificar gerando uma campanha real (via a
  receita "Webinário quinzenal") e lendo o resultado: os passos da janela retomam
  o template? o campo `media` traz um briefing útil? O anexo some nas peças
  só-texto e aparece com o briefing nas peças de mídia?

## Riscos

- Prompt mais longo pode diluir outras regras — manter as adições curtas e
  específicas, e conferir que templates/fallback/botões seguem corretos na geração
  de teste.
- Gate do anexo esconde o controle: garantir que a única forma de "religar" (o
  Editar do post / o refino da janela) continua óbvia, pra ninguém ficar preso
  numa peça só-texto sem saber como anexar.
