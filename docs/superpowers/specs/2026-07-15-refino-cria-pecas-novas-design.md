# Refino que cria peças novas (não só edita)

**Data:** 2026-07-15
**Status:** aprovado, aguardando plano de implementação

## Problema

No chat "Refinar campanha", quando o usuário pede para **adicionar** disparos (ex.: "1 post por dia de D-7 a D-2, aquecendo até o anúncio padrão"), a IA responde com confiança que criou as peças — mas **nada é adicionado**. O cabeçalho continua "3 toques · 14 posts".

Causa raiz (confirmada no código):

1. `refineCampaignAction` aplica as mudanças com `UPDATE ... WHERE sort_order = X`
   ([actions.ts:298-314](../../../app/(app)/campanhas/actions.ts)). Quando a IA
   devolve um `sort_order` que não existe (peça nova), o update não acerta nenhuma
   linha — e o Supabase **não retorna erro** nesse caso. Silenciosamente, nada acontece.
2. O prompt de refino ([refine-prompt.ts:21](../../../lib/ai/refine-prompt.ts))
   instrui a IA a "devolver o objeto completo com o **mesmo** sort_order" e "não
   incluir peças que não alterou" — ela não tem sequer o conceito de adicionar.
3. Mesmo que inserisse: uma peça nova precisa de `send_at`, calculado por
   `computeSendAt(âncora, offset_days, offset_time)` ([schedule.ts:1](../../../lib/schedule.ts)).
   A IA só devolve o rótulo `offset_label` ("D-7"), sem os dias; e o refino nem
   recebe a âncora da campanha.

## Decisões (do brainstorming)

- **Escopo: só ADICIONAR.** Habilitar o refino a criar peças novas (toques e posts).
  Fora de escopo: mover a data de uma peça **existente** pelo chat — lacuna vizinha,
  tratada em trabalho separado.
- **Peças novas explícitas.** A IA devolve adições em arrays próprios
  (`new_touches`/`new_group_posts`), separados dos arrays de edição — evita colisão de
  `sort_order` e deixa a intenção clara. O servidor atribui o `sort_order`.
- **Timing por offset numérico.** Cada peça nova traz `offset_days` (int) e
  `offset_time` ("HH:mm"); o servidor calcula `send_at` contra a âncora da campanha,
  igual à geração.
- **Posts novos herdam grupos** do post-referência: o post de Grupos com **mais
  grupos** selecionados (empate → menor `sort_order`). Se nenhum post tiver grupos,
  os novos nascem sem grupos.
- **A IA não mente.** O prompt manda relatar no `reply` só o que ela realmente
  devolveu; e a mensagem persistida do assistente ganha um selo factual derivado do
  que foi de fato inserido/editado.

## Não-objetivos

- Sem migration — as colunas já existem (`campaign_touches`/`campaign_group_posts`
  têm `sort_order`, `send_at`, `offset_label`, etc.).
- Sem tocar no caminho de envio (fila, jitter, validação). `rescheduleCampaign` já é
  chamado ao fim do refino e remonta a fila a partir das peças.
- Não recalcula `send_at` de peças **editadas** (mover data existente é outro trabalho).

## Escopo

### ① Schema da IA — `lib/ai/refine-schema.ts`

Adicionar dois arrays ao `REFINE_SCHEMA`, ao lado de `touch_updates`/`group_post_updates`:

- `new_touches`: itens com **todos** os campos de um toque gerado
  (`offset_label`, `role`, `meta_category`, `template_body`, `buttons`, `window_steps`,
  `fallback_copy`, `crm_action`, `risk_flag`) **mais** `offset_days` (integer) e
  `offset_time` (string). **Sem** `sort_order`.
- `new_group_posts`: `offset_label`, `role`, `communities`, `copy`, `media` **mais**
  `offset_days` (integer) e `offset_time` (string). **Sem** `sort_order`.

Ambos entram em `required` do objeto raiz (podem vir vazios `[]`). `additionalProperties:false`
como no resto do schema.

### ② Tipos e motor — `lib/ai/refine.ts`

- Novos tipos `NewTouch` e `NewGroupPost` (espelham os itens acima).
- `RefineResult` ganha `new_touches: NewTouch[]` e `new_group_posts: NewGroupPost[]`.

### ③ Prompt — `lib/ai/refine-prompt.ts`

`buildRefinePrompt` passa a incluir:

- A **âncora** da campanha (label + valor) e, em cada peça listada, o `send_at`
  atual (além do `offset_label`) — as peças não guardam `offset_days`, então a IA
  infere o offset relativo comparando `send_at` com a âncora.
- Instrução: para **editar**, use `*_updates` com o mesmo `sort_order` (como hoje);
  para **adicionar**, use `new_touches`/`new_group_posts` com `offset_days`
  (negativo = antes da âncora), `offset_time` e `offset_label`.
- Instrução: no `reply`, relatar **apenas** o que foi devolvido (quantas peças
  adicionadas/editadas) — nunca afirmar criação que não está nos arrays.

A âncora é resolvida a partir de `campaign.inputs` + o input `is_anchor` da receita.
Como `buildRefinePrompt` só recebe `campaign` hoje, ela passará a receber também o
`anchorLabel`/`anchorValue` já resolvidos pela action (mantém a função sem dependência
de I/O).

### ④ Ação — `app/(app)/campanhas/actions.ts` (`refineCampaignAction`)

1. Carregar a **receita** (`getRecipe(campaign.recipe_id)`) e resolver a âncora
   (`anchorLabel = recipe.inputs.find(is_anchor).label`; `anchorValue = campaign.inputs[anchorLabel]`),
   exatamente como `generateCampaignAction` ([actions.ts:80-81](../../../app/(app)/campanhas/actions.ts)).
2. Se vierem peças novas e a âncora não puder ser resolvida (receita apagada, sem
   input âncora, ou valor vazio) → lançar erro claro: "Não consigo datar peças novas
   sem a âncora da campanha." Não inserir peça sem `send_at`.
3. Aplicar `touch_updates`/`group_post_updates` como hoje.
4. Inserir `new_touches`:
   - `sort_order` = `nextSortOrder(campaign.touches)` incrementando por item.
   - `send_at` = `computeSendAt(anchorValue, offset_days, offset_time)`.
   - `template_name` = `buildCode(recipe.recipe_type, slugCode(role), anchorValue)`.
5. Inserir `new_group_posts`:
   - `sort_order` = `nextSortOrder(campaign.group_posts)` incrementando por item.
   - `send_at` = `computeSendAt(anchorValue, offset_days, offset_time)`.
   - `message_code` = `buildCode(recipe.recipe_type, slugCode(role), anchorValue)`.
   - Após inserir, vincular os grupos herdados: `community_ids` do post-referência
     (`pickReferenceGroups(campaign.group_posts)`), inserindo linhas em
     `campaign_group_post_communities` (`post_id` novo × cada `community_id`).
6. Persistir a mensagem do assistente com um **selo factual** prefixado, derivado das
   contagens reais aplicadas (ex.: "✓ 6 posts e 2 toques adicionados. " + `result.reply`).
   O valor de retorno da action também leva o selo.
7. `rescheduleCampaign(campaignId)` (já existente ao fim) remonta a fila.

### Helpers puros (novos, testáveis) — `lib/campaign-refine.ts`

- `nextSortOrder(items: { sort_order: number }[]): number` → `max(sort_order) + 1`
  (ou `0` se vazio). Usado incrementando para múltiplas inserções.
- `pickReferenceGroups(posts: { sort_order: number; community_ids: string[] }[]): string[]`
  → os `community_ids` do post com mais grupos; empate → menor `sort_order`; `[]` se
  nenhum tiver grupos.
- `slugCode(role: string): string` → identificador curto a partir do papel, para o
  `buildCode` das peças novas (reusa `slugifyIdentifier` de `@/lib/text`).

## Componentes tocados

| Arquivo | Mudança |
|---|---|
| `lib/ai/refine-schema.ts` | arrays `new_touches`/`new_group_posts` (①) |
| `lib/ai/refine.ts` | tipos + `RefineResult` (②) |
| `lib/ai/refine-prompt.ts` | âncora + offset_days + instrução de adicionar/relatar (③) |
| `app/(app)/campanhas/actions.ts` | insere peças novas, herda grupos, selo factual (④) |
| `lib/campaign-refine.ts` (novo) | `nextSortOrder`, `pickReferenceGroups`, `slugCode` |
| `lib/campaign-refine.test.ts` (novo) | testes dos helpers |

## Verificação

- **Unidade:** `nextSortOrder` (vazio → 0; [0,1,2] → 3; fora de ordem → max+1),
  `pickReferenceGroups` (escolhe o de mais grupos; empate → menor sort_order; nenhum
  com grupo → []), `slugCode` (papel → slug). Suíte inteira verde.
- **Integração (manual, precisa de `ANTHROPIC_API_KEY` + Supabase):** numa campanha
  rascunho, pedir no chat "adicione 1 post/dia de D-7 a D-2". Conferir: o cabeçalho
  sobe (ex.: 14 → 20 posts); as peças novas aparecem na Lista com data correta
  (D-7…D-2, antes da âncora) e já mirando os grupos herdados; o selo do chat bate com
  o que foi inserido. Editar uma peça existente no mesmo pedido continua funcionando.

## Riscos

- **IA devolvendo offset inconsistente** (offset_days que não bate com offset_label):
  o `send_at` segue `offset_days` (fonte de verdade); o label é só exibição. Aceitável
  e coerente com a geração.
- **Reagendar após envio parcial** (bug conhecido do P0): se a campanha já teve envio,
  `rescheduleCampaign` pode falhar por índice único — mas isso é pré-existente e será
  tratado no P0; adicionar peças a uma campanha **rascunho** (o caso deste fluxo) não
  dispara esse caminho.
- **Peça nova sem grupos** (nenhum post-referência com grupos): nasce sem alvo e não
  gera linha de fila até o usuário escolher — comportamento seguro, sinalizado pelo
  cartão da peça.
