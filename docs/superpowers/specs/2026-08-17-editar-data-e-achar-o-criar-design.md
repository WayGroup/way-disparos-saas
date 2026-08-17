# Editar a data da peça de grupo, e achar o botão de criar

**Data:** 2026-08-17
**Status:** aprovado, aguardando plano de implementação

## Problema

**Não existe como mudar a data de envio de uma peça.** `send_at` aparece na UI só para
leitura — no cabeçalho do cartão, no calendário, na prévia e no modal de detalhe. Nem
`PostFields` nem `TouchFields` incluem o campo, então o formulário de *Editar* não o
oferece. Hoje a data só é definida em quatro momentos, nenhum deles sob controle direto de
quem edita: na geração da campanha, pelo chat de refino, ao duplicar a campanha com outra
âncora, e no formulário de peça criada à mão.

**E o botão de criar peça existe, mas está escondido.** Entregue em 2026-08-14, o
*"+ Nova peça à mão"* é renderizado **depois** de todos os cartões de peça, dentro do ramo
`track === "grupos"` da visão Lista. Numa campanha com 12 peças, isso é uma rolagem longa
até encontrá-lo — e ele não existe nas visões Pipeline e Calendário. O dono do projeto
relatou não conseguir criar peça, com a funcionalidade no ar há um dia. Botão que só quem
já sabe onde fica encontra é botão que não existe.

## Decisões (do brainstorming)

- **Data e hora absolutas**, num seletor nativo — não dias/hora relativos à âncora. Editar
  uma peça existente é o ato de "mover esta peça para tal hora"; obrigar a conta mental
  contra uma âncora que nem aparece no cartão seria pior. (O formulário de *criação*
  continua relativo, porque lá o ato é outro: encaixar uma peça nova na régua da campanha.)
- **Campo dentro do editor que já existe**, e não edição rápida no cabeçalho do cartão nem
  arrastar no calendário. Zero tela nova, um caminho de edição só.
- **Data no passado e data vazia avisam, mas não bloqueiam salvar** — quem está
  reorganizando uma campanha passa por estados intermediários.
- **O botão de criar sobe para o cabeçalho da trilha**, ao lado do *limpar trilha*.
- **A trilha API individual não entra**: nem editar data, nem criar. Segue o combinado — o
  formulário de um toque tem uma dúzia de campos e é outro projeto.

## Fatos do código que sustentam o desenho

- `send_at` é `text`, no formato `"YYYY-MM-DD HH:mm"`, no horário de São Paulo e **sem
  fuso** — é a "agenda editorial". A conversão para instante real acontece em `toInstant`
  (`lib/schedule.ts`), que aplica `BR_OFFSET = "-03:00"`. O seletor `datetime-local` do
  navegador usa `"YYYY-MM-DDTHH:mm"` — mesma informação, separador diferente.
- `updateGroupPostAction` **já termina em `rescheduleCampaign`**. Basta a data entrar em
  `PostFields` para a fila se remontar sozinha ao salvar; nenhuma orquestração nova.
- **Nada é agendado para trás:** `partitionSchedulable` separa as peças cuja hora já passou
  e as reporta em vez de enfileirar. Data no passado, portanto, não é erro do sistema — é
  estado previsto, e o aviso na UI só torna visível o que já acontece.
- **Mudar a data de uma peça já enviada não a reenvia**: `dropAlreadyLive` (corrigido em
  2026-08-17) tira do plano os pares (peça, grupo) que já têm envio vivo.

## Não-objetivos

- **Sem migration.** A coluna `send_at` já existe em `campaign_group_posts`.
- Sem editar data de toque da API individual.
- Sem arrastar peça no calendário, sem edição rápida no cabeçalho do cartão.
- Sem tocar em `computeSendAt`, `toInstant`, `partitionSchedulable`, `rescheduleCampaign`
  ou `dropAlreadyLive`.
- Sem mexer no formulário de criação de peça (`new-group-post-form.tsx`) — ele continua
  relativo à âncora, por decisão consciente.
- **Não corrigir o desalinhamento da duplicação** (ver Riscos) — é bug preexistente e
  separado, registrado aqui para não se perder.

## Escopo

### ① Conversão de formato — `lib/schedule.ts`

Duas funções puras, ao lado de `formatSendAt`, que fala do mesmo formato:

```ts
/** "2026-08-18 19:07" → "2026-08-18T19:07", que é o que <input type="datetime-local"> lê. */
export function toDatetimeLocal(sendAt: string): string;

/** "2026-08-18T19:07" → "2026-08-18 19:07", o formato guardado. */
export function fromDatetimeLocal(value: string): string;
```

Regras, iguais nas duas direções:

- Entrada vazia devolve `""` — data vazia é estado válido (a peça existe, fora da fila).
- Entrada que não casa com o formato esperado devolve `""`, e não a string original. Um
  valor malformado que passasse adiante viraria `send_at` inválido no banco, e
  `validateSchedulable` só reclamaria na aprovação — tarde demais e longe da causa.
- `fromDatetimeLocal` aceita e descarta segundos (`"...T19:07:00"`), que alguns navegadores
  acrescentam.

É a única lógica de verdade desta entrega, e a que ganha teste: errar aqui desloca envio em
uma hora ou um dia, em silêncio.

### ② O campo — `app/(app)/campanhas/actions.ts` e `post-card.tsx`

- `PostFields` ganha `send_at: string`. Nenhuma mudança em `updateGroupPostAction` além de
  o campo passar a existir: ela já grava o objeto inteiro e já replaneja.
- No modo de edição do `PostCard`, um `<input type="datetime-local">` rotulado **"Data e
  hora do envio"**, alimentado por `toDatetimeLocal(post.send_at)` e gravado com
  `fromDatetimeLocal`.
- Abaixo do campo, um aviso que depende do valor, em `text-risk`, **sem bloquear o Salvar**:
  - vazio → "Sem data: a peça não entra na fila até você marcar um horário."
  - `isPast(...)` → "Essa data já passou. A peça não entra na fila — nada é agendado para trás."
  - caso contrário → nada.

### ③ O botão de criar, visível — `campaign-view.tsx`

- No cabeçalho da trilha, ao lado do *limpar trilha*, um **"+ nova peça"** que só aparece
  quando `track === "grupos"` (criar à mão não existe na trilha API).
- Clicar liga o mesmo estado `criando` que já existe. O formulário continua abrindo **no fim
  da lista**, que é onde a peça vai nascer — e a tela **rola até ele**, senão clicar no
  cabeçalho não produziria efeito visível numa lista de 12 peças. A rolagem é um `ref` no
  contêiner do formulário mais `scrollIntoView({ behavior: "smooth", block: "center" })`
  disparado quando `criando` passa a `true`.
- O botão de baixo, tracejado, **fica**: quem já está no fim da lista o encontra
  naturalmente, e some quando o formulário abre.

## Componentes tocados

| Arquivo | Mudança |
|---|---|
| `lib/schedule.ts` | `toDatetimeLocal` + `fromDatetimeLocal` (①) |
| `lib/schedule.test.ts` | testes das duas conversões (①) |
| `app/(app)/campanhas/actions.ts` | `send_at` em `PostFields` (②) |
| `app/(app)/campanhas/[id]/_components/post-card.tsx` | campo de data + avisos (②) |
| `app/(app)/campanhas/[id]/_components/campaign-view.tsx` | botão de criar no cabeçalho + rolagem até o formulário (③) |

## Verificação

- **Unidade** (`npm test`): as duas conversões, incluindo ida e volta, vazio, malformado e
  segundos descartados.
- **Typecheck** (`npx tsc --noEmit`) verde.
- **Manual, o caso central:** numa campanha em rascunho, editar uma peça, mudar a data para
  outro dia/hora, salvar; conferir que o cabeçalho do cartão mostra a data nova, que o
  calendário move a peça, e que em `/disparos` a fila daquela peça foi reagendada para o
  horário novo.
- **Manual, os avisos:** limpar a data e conferir o aviso de "sem data"; pôr uma data de
  ontem e conferir o aviso de "já passou". Nos dois casos, o Salvar continua habilitado.
- **Manual, peça já enviada:** mudar a data da peça que já saiu à força e conferir que ela
  **não** é reenfileirada para quem já recebeu (é `dropAlreadyLive` fazendo o trabalho).
- **Manual, o botão:** com a trilha Grupos aberta, o "+ nova peça" tem de estar visível
  **sem rolar**, e clicar nele tem de levar a tela até o formulário.

## Riscos

- **Data editada não sobrevive à duplicação.** `duplicateCampaignAction` **recalcula**
  `send_at` a partir dos slots da receita, não copia o valor da peça. Quem editar uma data e
  depois duplicar a campanha recebe de volta o horário padrão da receita. É defensável como
  "voltar ao padrão", mas é surpresa se ninguém avisar — fica registrado, sem mudança de
  código nesta entrega.
- **Bug preexistente, agora alcançável, na duplicação.** A mesma recalculação casa peça com
  slot da receita **por posição na lista** (`gruposSlots[idx]`). Desde que passou a ser
  possível excluir e criar peças (2026-08-14), as posições desalinham: duplicar uma campanha
  depois de excluir uma peça do meio dá data e código de mensagem errados em todas as peças
  seguintes, em silêncio. **Não é corrigido aqui** — é outro escopo, e merece o seu próprio
  spec.
- **Fuso.** O campo é lido e gravado como texto local, sem conversão de fuso, exatamente
  como o resto da agenda editorial. Quem abrir o app fora do horário de Brasília vê e digita
  o horário de Brasília — que é o correto para este produto, e é o que `BR_OFFSET` já assume.
