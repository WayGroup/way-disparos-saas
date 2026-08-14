# Lista de grupos que não vira muro

**Data:** 2026-08-14
**Status:** aprovado, aguardando plano de implementação

## Problema (observado em produção)

A campanha "Hotseat 18/08" tem **14 peças × 166 grupos**. Ao abrir `/campanhas/[id]`
para editar as copies, a tela fica inutilizável:

- **A barra do topo** (`campaign-groups-bar.tsx`, modo leitura) renderiza **todos** os
  ids de `consensus.ids` como chips, sem limite e sem rolagem. Com 166 grupos isso é um
  bloco que empurra as 14 peças para baixo da dobra.
- **Cada peça** monta um `GroupMultiSelect` → `GroupChips` com os 166 grupos. A caixa tem
  `max-h-44 overflow-y-auto`, então se contém verticalmente, mas são **14 caixas × 166
  botões = 2.324 chips renderizados numa página só**.

O resultado prático relatado: não dá para mexer nas copies.

Ironicamente o **modo de edição** da barra já lida bem com escala — `GroupChips` tem busca
e rolagem, e o comentário no topo dele já diz que "contas reais têm centenas de grupos".
Quem nunca foi pensado para escala foi o modo de **leitura**.

## Decisões (do brainstorming)

- **Resumir e abrir sob demanda**, em vez de só colocar rolagem (mantém 166 chips no DOM)
  ou de mandar tudo para um modal (encarece um olhar que se dá o tempo todo).
- **Limite de 8.** Até 8 grupos, a barra mostra todos os chips — exatamente o
  comportamento de hoje. Acima disso, resume. Campanha pequena não percebe a mudança.
- **O resumo mostra nomes + total**, não só o número: os primeiros 8 chips seguidos de
  "+N outros".
- **O seletor de cada peça nasce fechado.** Enquanto fechado, os chips **não são
  renderizados** — não é `display:none`, é não existir na página. É o que elimina os 2.324
  botões.
- **Peça sem nenhum grupo não fecha.** Continua aberta e em vermelho: é um erro que faz a
  peça não sair, e esconder isso atrás de um clique seria pior que o muro.

## Não-objetivos

- **Sem migration, sem server action nova, sem mudança no que é enviado.** O alvo do
  disparo é exatamente o mesmo antes e depois; a mudança é 100% de apresentação.
- Não mexer no `GroupChips` nem no modo de edição da barra — os dois já funcionam com 166.
- Não mexer no `groupConsensus`, no `matchCommunities`, nem em `setPostCommunitiesAction` /
  `setCampaignCommunitiesAction`.
- Não resolver a janela de entrega de ~110 min por peça com 166 grupos (o disparo demora
  1h50 para percorrer a lista, e as copies de horário chegam fora de hora nos últimos
  grupos). É um problema real, medido, e **fica registrado como risco em aberto** — outro
  escopo.
- Sem virtualização de lista, sem paginação dos chips: fechar por padrão já derruba o
  custo, e o `GroupChips` aberto sozinho (166 chips) nunca foi o gargalo.

## Escopo

### ① Resumo compartilhado — `app/(app)/campanhas/_components/group-summary.tsx` (novo, client)

```tsx
export const RESUMO_LIMITE = 8;

export function GroupSummary({
  names,
  limite = RESUMO_LIMITE,
}: {
  names: string[];
  limite?: number;
}): React.ReactElement;
```

Puramente apresentacional, sem estado e sem callback:

- Renderiza os primeiros `limite` nomes como chips no estilo já usado
  (`rounded-full border border-emerald bg-emerald/10 text-emeraldd`).
- Se sobrarem nomes, acrescenta um `<span>` com `+N outros` em `font-mono text-xs
  text-muted`. **É texto, não botão** — quem controla abrir/fechar é o pai, porque a
  barra e o seletor de peça têm afordâncias diferentes ("ver todos" vs "alterar").
- `names` vazio renderiza `null`; o pai é quem decide o que dizer nesse caso.

Sem teste de unidade: é `slice` e contagem, sem ramo de decisão que valha um teste. A
verificação é typecheck + a suíte existente + conferência visual.

### ② Barra do topo — `app/(app)/campanhas/[id]/_components/campaign-groups-bar.tsx`

Só o ramo `consensus.uniform && consensus.ids.length > 0` (linhas 83-92 atuais) muda.
Estado local novo: `const [aberto, setAberto] = useState(false)`.

- **Fechado** (padrão) → `<GroupSummary names={nomes} />`. Com 8 grupos ou menos ele
  renderiza todos os chips e nenhum "+N outros", que é exatamente a tela de hoje — por
  isso **não existe um ramo separado para campanha pequena**, é o mesmo caminho.
- **Aberto** → todos os chips dentro de uma caixa `max-h-44 overflow-y-auto`.
- O botão de alternar (`ver todos` / `fechar`, em `font-mono text-xs text-muted
  hover:text-ink`, mesmo tratamento do "▾ gerenciar" da faixa de conexão) **só aparece
  quando `consensus.ids.length > RESUMO_LIMITE`** — sem ele, não há o que abrir.

`nomes` = `consensus.ids.map(nameOf)`, reusando a função `nameOf` que já existe no arquivo
(ela já resolve id órfão para "grupo removido").

Os ramos "nenhum grupo selecionado" e "os grupos variam por peça" ficam **intactos**, assim
como o botão Editar e todo o modo de edição.

### ③ Seletor da peça — `app/(app)/campanhas/[id]/_components/group-multi-select.tsx`

Estado local novo: `const [aberto, setAberto] = useState(false)`.

Fechado (padrão) renderiza, no lugar do `<GroupChips>`:

- `<GroupSummary names={nomesSelecionados} />`, onde `nomesSelecionados` vem de `ids`
  mapeados para `wa_subject || name` pelo array `groups`.
- Um botão `alterar` que faz `setAberto(true)`.

Aberto renderiza o `<GroupChips>` de hoje, sem nenhuma mudança nele, mais um botão
`fechar`.

**Força aberto** quando `ids.length === 0`: o aviso vermelho "Sem grupo selecionado — esta
peça não será enviada" continua visível e o seletor fica acessível sem clique extra.

O botão Salvar e o cálculo de `dirty` não mudam. Depois de salvar, o `router.refresh()`
recarrega os dados do servidor e reconcilia — o estado de client (`aberto`) é preservado,
e inicializadores de `useState` não rodam de novo. O seletor continua aberto, o que é
desejável: você acabou de editar a peça e pode querer mexer em outra coisa dela. (Este
comportamento é resultado da forma como o App Router do Next trabalha com client
components: `router.refresh()` não remonta, só refaz a busca no servidor.)

## Componentes tocados

| Arquivo | Mudança |
|---|---|
| `app/(app)/campanhas/_components/group-summary.tsx` (novo) | `GroupSummary` + `RESUMO_LIMITE` (①) |
| `app/(app)/campanhas/[id]/_components/campaign-groups-bar.tsx` | modo leitura resume e abre sob demanda (②) |
| `app/(app)/campanhas/[id]/_components/group-multi-select.tsx` | nasce fechado; "alterar" revela (③) |

## Verificação

- **Typecheck** (`npx tsc --noEmit`) e **suíte** (`npm test`) verdes. A suíte não cobre
  componentes; o que ela precisa provar aqui é que nada de lógica pura foi quebrado.
- **Manual, na campanha real "Hotseat 18/08" (14 peças × 166 grupos):** abrir
  `/campanhas/[id]`; a barra do topo mostra 8 chips e "+158 outros"; as 14 peças aparecem
  sem precisar rolar um muro; cada peça mostra o resumo e um "alterar"; clicar em
  "alterar" abre o seletor com busca; escolher e salvar funciona como antes; a contagem de
  grupos da peça continua 166.
- **Manual, campanha pequena:** abrir uma campanha com poucos grupos (as de webinário
  anteriores) e confirmar que a barra continua mostrando todos os chips, sem botão de
  abrir — a mudança não pode aparecer onde não é necessária.
- **Manual, caso de erro:** uma peça sem grupo selecionado precisa aparecer já aberta, em
  vermelho.

## Riscos

- **Esconder o alvo do disparo é, por definição, esconder informação que importa.**
  Mitigado por: o total aparece sempre ("+158 outros" e a contagem no botão Salvar), a
  peça sem grupo nunca fecha, e nada do que é enviado muda.
- **O limite de 8 é arbitrário.** Escolhido para caber numa linha ou duas na maioria das
  larguras; se ficar ruim na prática, é uma constante num arquivo só.
- **Risco de regressão é baixo por construção**: nenhuma escrita, nenhuma server action,
  nenhum dado novo. O pior caso de um erro aqui é visual.
- **Campanha com TODAS as peças vazias reconstrói o muro de chips.** Pode acontecer em
  campanha recém-gerada onde a sugestão da IA não casou com nenhum grupo, ou se alguém
  aplica seleção vazia a todas as peças pela barra. Cada peça vazia abre por padrão
  renderizando todos os 166 grupos — não os selecionados, não há. A barra em modo Editar
  fica visível acima dessa tela e permite corrigir todas as peças de uma vez. Não é
  preso, só feio. Aceito como risco conhecido.
- **Fora deste escopo, mas registrado:** com 166 grupos cada peça leva ~110 minutos para
  percorrer a lista (espaçamento anti-ban de 20-60s por grupo). Medido na fila real: a
  peça "estamos ao vivo" das 19:07 termina 21:01. A ferramenta aceita "19:07" sem avisar
  que aquilo significa "19:07 às 21:01". Vale um aviso na tela de agendamento, noutro
  escopo.
