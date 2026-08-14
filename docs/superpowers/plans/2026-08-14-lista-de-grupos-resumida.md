# Lista de grupos que não vira muro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que uma campanha com 166 grupos deixe de renderizar 2.324 chips na página e volte a permitir editar as copies das peças.

**Architecture:** Um componente de apresentação novo (`GroupSummary`) mostra os primeiros N nomes e resume o resto em "+X outros". A barra de grupos da campanha e o seletor de grupos de cada peça passam a usá-lo no estado fechado, renderizando os chips completos só quando abertos. Nenhuma escrita, nenhuma server action, nenhum dado novo — a mudança é 100% de apresentação.

**Tech Stack:** Next.js 16 (App Router, client components), TypeScript, Tailwind v4. UI em PT-BR.

## Global Constraints

- **Sem migration, sem server action nova, sem mudança no que é enviado.** O alvo do disparo é exatamente o mesmo antes e depois.
- **Não tocar** em `app/(app)/campanhas/_components/group-chips.tsx`, em `lib/sends/group-consensus.ts`, em `lib/sends/match.ts`, nem nas actions `setPostCommunitiesAction` / `setCampaignCommunitiesAction`.
- **Não tocar** no modo de edição de `campaign-groups-bar.tsx` (o bloco `if (editing)`) — ele já lida com 166 grupos.
- **`RESUMO_LIMITE = 8`**, exato, definido uma única vez em `group-summary.tsx` e importado por quem precisar. Nunca redigitar o número 8 noutro arquivo.
- **Peça sem nenhum grupo selecionado nasce ABERTA** e não pode ser fechada: é um erro que impede a peça de sair.
- **Copy em PT-BR.** Tokens de cor já existentes: `border-emerald`, `bg-emerald/10`, `text-emeraldd`, `border-line`, `bg-paper`, `text-muted`, `text-ink`, `text-risk`.
- **Imports absolutos com `@/`**, exceto os relativos que já são o padrão dentro de `_components/` (`../../_components/...`, `../../actions`) — mantenha o estilo do arquivo que você está editando.
- Comandos de verificação: `npx tsc --noEmit` e `npm test`.
- **Sem teste de unidade novo.** É `slice` e contagem, sem ramo de decisão que valha um teste; a suíte não cobre componentes neste projeto. A verificação é typecheck + suíte existente verde + o roteiro manual no fim deste plano.

---

### Task 1: `GroupSummary` e a barra do topo da campanha

O componente novo nasce junto com seu primeiro consumidor, para a tarefa terminar com algo visível na tela.

**Files:**
- Create: `app/(app)/campanhas/_components/group-summary.tsx`
- Modify: `app/(app)/campanhas/[id]/_components/campaign-groups-bar.tsx`

**Interfaces:**
- Consumes: `groupConsensus` e a função local `nameOf`, ambas já existentes em `campaign-groups-bar.tsx`.
- Produces (a Task 2 depende destes dois nomes, exatos):
  - `RESUMO_LIMITE: number` (valor `8`)
  - `GroupSummary({ names, limite }: { names: string[]; limite?: number })`

- [ ] **Step 1: Criar o componente de resumo**

Criar `app/(app)/campanhas/_components/group-summary.tsx` com exatamente:

```tsx
"use client";

/**
 * Acima deste tamanho a lista de grupos vira resumo. Uma campanha real chegou a 166
 * grupos: renderizados todos, viram um muro que empurra as peças para fora da tela.
 */
export const RESUMO_LIMITE = 8;

/**
 * Mostra os primeiros nomes como chips e resume o resto em "+N outros".
 *
 * Só apresentação: sem estado e sem callback. Quem controla abrir e fechar é o pai —
 * a barra da campanha diz "ver todos" e o seletor da peça diz "alterar", e um botão
 * aqui dentro obrigaria os dois a serem iguais.
 *
 * Com `names.length <= limite` ele renderiza todos os chips e nenhum "+N outros", que
 * é exatamente a tela de antes desta mudança — por isso o consumidor não precisa de um
 * ramo separado para campanha pequena.
 */
export function GroupSummary({
  names,
  limite = RESUMO_LIMITE,
}: {
  names: string[];
  limite?: number;
}) {
  if (names.length === 0) return null;

  const mostrados = names.slice(0, limite);
  const resto = names.length - mostrados.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {mostrados.map((nome, i) => (
        // Nome não é único: a mesma turma aparece como dois grupos com o mesmo título.
        <span
          key={`${nome}-${i}`}
          className="rounded-full border border-emerald bg-emerald/10 text-emeraldd font-semibold px-2.5 py-1 text-xs"
        >
          {nome}
        </span>
      ))}
      {resto > 0 && <span className="font-mono text-xs text-muted">+{resto} outros</span>}
    </div>
  );
}
```

- [ ] **Step 2: Importar o resumo na barra e criar o estado de aberto/fechado**

Em `app/(app)/campanhas/[id]/_components/campaign-groups-bar.tsx`, acrescentar aos imports do topo (junto da linha que já importa `GroupChips`):

```tsx
import { GroupSummary, RESUMO_LIMITE } from "../../_components/group-summary";
```

E, logo depois da linha `const [editing, setEditing] = useState(false);`, acrescentar:

```tsx
  const [aberto, setAberto] = useState(false);
```

- [ ] **Step 3: Trocar o bloco de chips do modo leitura**

Ainda em `campaign-groups-bar.tsx`, no `return` final (o que **não** está dentro do `if (editing)`), substituir este bloco:

```tsx
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {consensus.ids.map((id) => (
                <span
                  key={id}
                  className="rounded-full border border-emerald bg-emerald/10 text-emeraldd font-semibold px-2.5 py-1 text-xs"
                >
                  {nameOf(id)}
                </span>
              ))}
            </div>
```

por:

```tsx
            <div className="mt-1.5">
              {aberto ? (
                <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
                  {consensus.ids.map((id) => (
                    <span
                      key={id}
                      className="rounded-full border border-emerald bg-emerald/10 text-emeraldd font-semibold px-2.5 py-1 text-xs"
                    >
                      {nameOf(id)}
                    </span>
                  ))}
                </div>
              ) : (
                <GroupSummary names={consensus.ids.map(nameOf)} />
              )}

              {consensus.ids.length > RESUMO_LIMITE && (
                <button
                  onClick={() => setAberto((a) => !a)}
                  aria-expanded={aberto}
                  className="mt-1.5 font-mono text-xs text-muted hover:text-ink"
                >
                  {aberto ? "▴ fechar" : `▾ ver todos os ${consensus.ids.length}`}
                </button>
              )}
            </div>
```

Os outros dois ramos do mesmo `return` — o `<p>` de "Nenhum grupo selecionado" e o de "os grupos variam por peça" — ficam **exatamente como estão**. O botão Editar também.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm test`
Expected: toda a suíte verde (249 testes na baseline atual; nenhum teste novo nesta tarefa).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/campanhas/_components/group-summary.tsx" "app/(app)/campanhas/[id]/_components/campaign-groups-bar.tsx"
git commit -m "feat: barra de grupos da campanha resume acima de 8 e abre sob demanda"
```

---

### Task 2: O seletor de grupos de cada peça nasce fechado

É esta tarefa que elimina os 2.324 chips: com 14 peças fechadas, nenhum chip de seletor é renderizado.

**Files:**
- Modify: `app/(app)/campanhas/[id]/_components/group-multi-select.tsx`

**Interfaces:**
- Consumes (da Task 1): apenas `GroupSummary({ names, limite }: { names: string[]; limite?: number })`, exportado de `app/(app)/campanhas/_components/group-summary.tsx`. **`RESUMO_LIMITE` não é usado nesta tarefa** — o seletor da peça sempre resume, sem limiar próprio, então basta o padrão interno do `GroupSummary`.
- Produces: nada — é a ponta da cadeia.

- [ ] **Step 1: Importar o resumo**

Em `app/(app)/campanhas/[id]/_components/group-multi-select.tsx`, acrescentar aos imports do topo (junto da linha que já importa `GroupChips`):

```tsx
import { GroupSummary } from "../../_components/group-summary";
```

`RESUMO_LIMITE` **não** é importado aqui: o seletor da peça usa o padrão do próprio `GroupSummary`.

- [ ] **Step 2: Criar o estado de aberto e o resolvedor de nome**

Logo depois da linha que declara `ids` (`const [ids, setIds] = useState<string[]>(...)`), acrescentar:

```tsx
  // Peça sem grupo nenhum nasce ABERTA e não oferece botão de fechar: é um erro que
  // impede a peça de sair, e escondê-lo atrás de um clique trocaria um problema visual
  // por um de disparo. O valor inicial é calculado uma vez, então escolher grupos depois
  // não fecha o seletor no meio da interação.
  const [aberto, setAberto] = useState(ids.length === 0);

  const nomeDe = (id: string) => {
    const g = groups.find((x) => x.id === id);
    return g ? g.wa_subject || g.name : "grupo removido";
  };
```

- [ ] **Step 3: Trocar o corpo pelo par resumo/seletor**

Substituir este bloco:

```tsx
      <div className="mt-1.5">
        <GroupChips groups={groups} value={ids} onChange={setIds} disabled={pending} />
      </div>
```

por:

```tsx
      <div className="mt-1.5">
        {aberto ? (
          <GroupChips groups={groups} value={ids} onChange={setIds} disabled={pending} />
        ) : (
          <GroupSummary names={ids.map(nomeDe)} />
        )}
      </div>

      {ids.length > 0 && (
        <button
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          className="mt-1.5 font-mono text-xs text-muted hover:text-ink"
        >
          {aberto ? "▴ fechar" : `▾ alterar os ${ids.length} grupos`}
        </button>
      )}
```

O aviso vermelho de `ids.length === 0` e o botão Salvar que vêm logo abaixo ficam **exatamente como estão**. O cálculo de `dirty` não muda.

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm test`
Expected: toda a suíte verde.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/campanhas/[id]/_components/group-multi-select.tsx"
git commit -m "feat: seletor de grupos da peca nasce fechado, resumindo os escolhidos"
```

---

## Verificação manual (depois da Task 2)

Rodar `npm run dev`.

- [ ] **A campanha grande.** Abrir a campanha **"Hotseat 18/08"** (14 peças, 166 grupos). A barra do topo mostra 8 chips e "+158 outros", com "▾ ver todos os 166". As 14 peças aparecem logo abaixo, sem muro no caminho. Cada peça mostra 8 chips, "+158 outros" e "▾ alterar os 166 grupos".
- [ ] **Abrir e fechar.** "ver todos os 166" abre a lista completa numa caixa com rolagem e o botão vira "▴ fechar"; fechar volta ao resumo.
- [ ] **Alterar de verdade.** Numa peça, clicar em "alterar os 166 grupos" → o seletor com busca aparece → tirar um grupo → o botão "Salvar 165 grupo(s)" aparece → salvar → a página recarrega e a peça volta ao resumo, agora com "+157 outros". Conferir em `/disparos` que a fila daquela peça reflete a mudança.
- [ ] **Editar a copy.** Numa peça, clicar em Editar, mudar a mensagem, Salvar. Este é o fluxo que estava bloqueado — tem que estar fluido.
- [ ] **Campanha pequena não muda.** Abrir uma campanha antiga de webinário com poucos grupos: os chips aparecem todos e **não existe** botão de abrir, nem na barra nem nas peças.
- [ ] **O caso de erro.** Numa peça, tirar todos os grupos e salvar. Ao recarregar, essa peça tem que aparecer com o seletor **já aberto**, o aviso vermelho "Sem grupo selecionado — esta peça não será enviada" visível, e **sem** botão de fechar.

## Riscos conhecidos (do spec, não são bugs a corrigir aqui)

- Esconder o alvo do disparo é esconder informação que importa. Mitigado pelo total sempre visível ("+158 outros", "alterar os 166 grupos", e a contagem no botão Salvar), pela peça sem grupo que nunca fecha, e por nada do que é enviado mudar.
- O limite de 8 é arbitrário, escolhido para caber em uma ou duas linhas. Se ficar ruim na prática, é uma constante num arquivo só.
- **Fora deste escopo:** com 166 grupos, cada peça leva ~110 minutos para percorrer a lista (espaçamento anti-ban de 20-60s por grupo). Medido na fila real: a peça "estamos ao vivo" das 19:07 termina 21:01. A ferramenta aceita "19:07" sem avisar que aquilo significa "19:07 às 21:01".
