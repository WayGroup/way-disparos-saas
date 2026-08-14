# Excluir peças e criar peça de grupo à mão

**Data:** 2026-08-14
**Status:** aprovado, aguardando plano de implementação

## Problema

Não existe como remover uma peça de uma campanha. Confirmado nos três lugares onde poderia
estar:

- Os cartões de peça (`touch-card.tsx`, `post-card.tsx`) oferecem só **Editar**,
  **Regenerar** e **Enviar agora**.
- Não há server action que apague peça. A única exclusão do sistema é
  `deleteCampaignAction`, que apaga a **campanha inteira**.
- O chat de refino não cobre: `REFINE_SCHEMA` tem `touch_updates`, `group_post_updates`,
  `new_touches` e `new_group_posts` — atualiza e cria, **nunca remove**.

Consequência prática relatada: para tirar uma peça que a IA gerou e você não quer, o único
caminho é apagar a campanha e recomeçar.

Existe uma segunda lacuna, descoberta ao investigar a primeira: **não há como criar peça à
mão**. Peças só nascem da geração inicial ou do chat de refino — as duas são a IA. Sem
isso, "limpar a trilha" deixaria uma campanha vazia e impossível de preencher: excluir sem
poder criar é armadilha, não recurso.

## Decisões (do brainstorming)

- **Excluir vale para as duas trilhas.** Criar à mão, nesta entrega, **só para a trilha
  Grupos** — o formulário de um toque da API individual tem uma dúzia de campos (categoria
  Meta, corpo do template, botões, passos da janela de 24h, fallback, ação de CRM,
  sinalizador de risco, variante utility) e é outro projeto.
- **Botão no rodapé do cartão**, ao lado de Editar/Regenerar/Enviar agora — em vez de um
  menu ⋯ (um menu inteiro para uma ação só) ou de seleção múltipla com caixas (o "limpar
  trilha" já cobre o caso em massa).
- **Peça criada à mão usa dias + hora relativos à âncora**, como as da IA. Data absoluta
  prenderia a peça a uma data e ela não acompanharia a duplicação da campanha para outra
  data-âncora.
- **A peça à mão herda os grupos** da peça com mais grupos selecionados, via
  `pickReferenceGroups` — o mesmo que o refino já faz ao criar peça. Sem isso seria preciso
  marcar 166 grupos a cada peça nova.
- **Peça à mão é indistinguível de peça da IA**: mesmos campos, mesma numeração, mesmo
  tratamento na fila. Nenhum selo de "feita à mão".

## Fatos do código que sustentam o desenho

Verificados antes de desenhar; o desenho depende deles:

- **Toques nunca entram na fila.** `buildGroupPieces` só monta a trilha Grupos; o
  comentário em `actions.ts` é explícito ("A trilha API continua manual — não entra na
  fila"). Por isso `updateTouchAction` não chama `rescheduleCampaign` e
  `updateGroupPostAction` chama. Apagar um toque não tem consequência sobre disparo.
- **`nextSortOrder` é `max(sort_order) + 1`** (`lib/campaign-refine.ts`). Buraco na
  numeração é inofensivo: nada renumera, e peça nova nunca colide com o número de uma
  apagada. Não há constraint de unicidade em `(campaign_id, sort_order)`.
- **Toda ação que muda peça de grupo termina em `rescheduleCampaign`** (8 chamadas hoje).
  Ela apaga os `scheduled_sends` pendentes **não-forçados** da campanha e replaneja a
  partir das peças atuais — preservando um "Enviar agora" em voo.
- **`scheduled_sends.post_id` tem `on delete cascade`** (`0015_scheduled_sends.sql:10`).
  Apagar uma peça de grupo apaga **todas** as linhas de envio dela, inclusive as com status
  `enviado` — o histórico daquela peça some junto. Mesmo comportamento já aceito em
  `deleteCampaignAction`, cujo aviso na UI diz "o histórico de enviados some".
- **A âncora** vem do input da receita marcado `is_anchor`, cruzado com os valores da
  campanha — a resolução já existe em `refineCampaignAction`.

## Não-objetivos

- **Sem migration.** Nenhuma coluna, tabela ou constraint nova.
- **Sem criar toque da API individual à mão** — outro projeto, escopo maior.
- Sem desfazer/lixeira: exclusão é física, como já é a de campanha.
- Sem renumerar `sort_order` após exclusão (desnecessário, ver acima).
- Sem reordenar peças, sem duplicar peça, sem mover peça entre trilhas.
- Sem mexer no `rescheduleCampaign`, no `buildGroupPieces`, nem no chat de refino.
- Sem selo visual distinguindo peça à mão de peça da IA.

## Escopo

### ① Lógica pura — `lib/campaign-manual-post.ts` (novo)

Monta a linha de uma peça de grupo criada à mão a partir do que a pessoa digitou mais o
contexto da campanha. Puro: sem banco, sem rede.

```ts
export type ManualPostInput = {
  offset_label: string;
  role: string;
  copy: string;
  media: string;
  offset_days: number;
  offset_time: string;
};

export type ManualPostDraft = {
  sort_order: number;
  offset_label: string;
  role: string;
  communities: string;
  copy: string;
  media: string;
  message_code: string;
  send_at: string;
  community_ids: string[];
};

export function buildManualGroupPost(
  input: ManualPostInput,
  ctx: {
    existing: { sort_order: number; community_ids: string[] }[];
    recipeType: string;
    anchor: string;
  },
): ManualPostDraft;
```

Compõe helpers que já existem, sem reimplementar nenhum:

- `sort_order` ← `nextSortOrder(ctx.existing)`
- `message_code` ← `buildCode(ctx.recipeType, slugCode(input.role), ctx.anchor)`
- `send_at` ← `computeSendAt(ctx.anchor, input.offset_days, input.offset_time)`
- `community_ids` ← `pickReferenceGroups(ctx.existing)`
- `communities` ← `""` — esse campo é a sugestão em texto livre da IA; peça à mão não tem
  sugestão, e deixá-lo vazio é o que impede o casador de nomes de inventar alvo.

É esta composição que ganha teste de unidade. As cinco funções que ela chama já são
testadas; o que nunca foi testado é a fiação entre elas, que é onde o erro mora.

### ② Server actions — `app/(app)/campanhas/actions.ts`

Quatro ações novas. As três que mexem em peça de grupo terminam em `rescheduleCampaign`;
a de toque não, porque toque não gera envio.

- **`deleteTouchAction(campaignId: string, sortOrder: number): Promise<void>`**
  `delete` em `campaign_touches` por `(campaign_id, sort_order)` — mesmo endereçamento que
  `updateTouchAction` já usa. Sem reschedule. `revalidatePath`.

- **`deleteGroupPostAction(campaignId: string, postId: string): Promise<void>`**
  `delete` em `campaign_group_posts` por `id` — mesmo endereçamento de
  `setPostCommunitiesAction`. O cascade cuida da tabela de junção e dos `scheduled_sends`.
  Depois, `rescheduleCampaign(campaignId)`. `revalidatePath`.

- **`clearTrackAction(campaignId: string, track: "api" | "grupos"): Promise<void>`**
  `delete` em `campaign_touches` ou `campaign_group_posts` por `campaign_id`.
  `rescheduleCampaign` só quando `track === "grupos"`. `revalidatePath`.

- **`createGroupPostAction(campaignId: string, input: ManualPostInput): Promise<void>`**
  1. Carrega campanha e receita e resolve a âncora, do mesmo jeito que
     `refineCampaignAction` faz.
  2. `buildManualGroupPost(input, { existing, recipeType, anchor })`.
  3. `insert` em `campaign_group_posts` com tudo menos `community_ids`, com `.select("id")`.
  4. `insert` dos `community_ids` na tabela de junção, usando o id devolvido.
  5. `rescheduleCampaign(campaignId)`. `revalidatePath`.

  Valida antes de escrever: `role` e `copy` vazios lançam com mensagem em PT-BR. Nada é
  gravado pela metade.

### ③ Botão Excluir nos cartões — `touch-card.tsx` e `post-card.tsx`

No rodapé que já existe, ao lado de Editar/Regenerar (e Enviar agora, no caso do post), um
**Excluir** em `text-risk`. `confirm()` antes, com texto que declara a consequência real:

- **Toque:** "Excluir este toque? Ele some da campanha. A trilha API individual não gera
  envio, então nada agendado muda."
- **Peça de grupo, campanha em rascunho:** "Excluir esta peça? Ela some da campanha."
- **Peça de grupo, campanha aprovada:** o mesmo, mais "Os envios pendentes dela são
  cancelados, e o histórico do que já saiu por esta peça some junto. Não tem desfazer."

A distinção exige uma **prop nova**: hoje nem `TouchCard` nem `PostCard` recebem o status
da campanha. Só o `PostCard` precisa dela — o texto do toque é fixo, já que toque nunca
gera envio. Então `PostCard` ganha `aprovada: boolean`, passado por `campaign-view.tsx`,
que já tem `campaign.status` em mãos. Nada de ida extra ao servidor para montar o texto.

### ④ Limpar trilha e Nova peça — `campaign-view.tsx`

- **`Limpar trilha`**, discreto (`font-mono text-xs text-muted hover:text-risk`), no
  cabeçalho da trilha ativa. Abre um modal leve com **type-to-confirm**: o botão só habilita
  quando a pessoa digita `Limpar` (exato, após `trim`). Mesma barreira, e pelo mesmo motivo,
  da exclusão de campanha. O aviso nomeia quantas peças somem e, na trilha Grupos com
  campanha aprovada, que a fila e o histórico delas somem junto.
- **`+ Nova peça`**, no fim da lista da trilha **Grupos** apenas, abrindo o formulário ⑤.

### ⑤ Formulário da peça à mão — `new-group-post-form.tsx` (novo, client)

Cartão inline no mesmo estilo do modo de edição do `PostCard`. Campos: rótulo, papel,
mensagem, briefing de mídia, **dias** (inteiro, negativo = antes) e **hora** (`HH:mm`).

Mostra, abaixo dos campos de data, a data resultante calculada da âncora — para a pessoa
ver "1 dia antes às 19:00" virar uma data concreta antes de salvar.

Salvar chama `createGroupPostAction` e fecha. Cancelar descarta. Botão desabilitado
enquanto papel ou mensagem estiverem vazios.

## Componentes tocados

| Arquivo | Mudança |
|---|---|
| `lib/campaign-manual-post.ts` (novo) | `buildManualGroupPost` (①) |
| `lib/campaign-manual-post.test.ts` (novo) | testes da composição (①) |
| `app/(app)/campanhas/actions.ts` | as quatro ações novas (②) |
| `app/(app)/campanhas/[id]/_components/touch-card.tsx` | botão Excluir (③) |
| `app/(app)/campanhas/[id]/_components/post-card.tsx` | botão Excluir + prop `aprovada` (③) |
| `app/(app)/campanhas/[id]/_components/campaign-view.tsx` | passa `aprovada` ao PostCard (③); Limpar trilha + Nova peça (④) |
| `app/(app)/campanhas/[id]/_components/new-group-post-form.tsx` (novo) | o formulário (⑤) |

## Verificação

- **Unidade** (`npm test`): `buildManualGroupPost` cobrindo numeração a partir da maior
  existente, primeira peça de uma trilha vazia, herança dos grupos da peça com mais grupos,
  `communities` sempre vazio, e o código e a data derivados do papel e da âncora.
- **Typecheck** (`npx tsc --noEmit`) verde.
- **Manual, exclusão:** numa campanha em rascunho, excluir um toque e uma peça de grupo;
  conferir que somem e que as demais continuam intactas, com os números originais. Excluir
  uma peça de grupo de campanha **aprovada** e conferir em `/disparos` que os envios
  pendentes dela sumiram e que os das outras peças continuam lá.
- **Manual, limpar trilha:** o botão só habilita ao digitar `Limpar`; ao confirmar, a
  trilha esvazia e a outra trilha não é tocada.
- **Manual, criar:** criar uma peça à mão na trilha Grupos; conferir que ela nasce com os
  mesmos grupos das outras, com código de mensagem no mesmo padrão, e que aparece na fila
  em `/disparos` no horário calculado. Depois editá-la pelo Editar normal e conferir que se
  comporta como qualquer outra.

## Riscos

- **Excluir peça de grupo apaga o histórico de envios dela**, não só os pendentes — o
  cascade não distingue status. É o comportamento já aceito para exclusão de campanha, e a
  confirmação diz isso com todas as letras. Quem quiser preservar o registro deve editar a
  peça em vez de excluir.
- **Exclusão é física e sem desfazer.** Mitigado pelo `confirm()` por peça e pelo
  type-to-confirm da trilha; nenhuma outra proteção, por decisão de produto.
- **Peça à mão com âncora vazia**: se a campanha não tiver valor para o input âncora,
  `computeSendAt` não produz data e a peça nasce sem `send_at` — ela existe, mas não entra
  na fila. É o mesmo que já acontece com peça da IA nessa situação; o validador de
  agendamento (`validateSchedulable`) reclama na hora de aprovar, então o erro aparece antes
  de virar envio perdido.
- **Criar à mão só existe na trilha Grupos.** Limpar a trilha API individual deixa a pessoa
  sem como repovoá-la a não ser pelo chat de refino. O aviso do type-to-confirm dessa trilha
  precisa dizer isso.
