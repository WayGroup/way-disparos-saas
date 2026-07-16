# Menu de ações (⋯) na lista de campanhas

**Data:** 2026-07-15
**Status:** aprovado, aguardando plano de implementação

## Problema

A lista `/campanhas` só permite abrir uma campanha (link no nome). Não há como
**renomear** nem **excluir** campanha, e **duplicar** só existe dentro da campanha
aberta. Campanhas de teste/erradas se acumulam sem limpeza (lacuna P3 da análise).

## Decisões (do brainstorming)

- Um menu **⋯** (kebab) à direita de cada linha da tabela, com **Renomear**,
  **Duplicar** e **Excluir**.
- **Excluir** vale para **qualquer** campanha (rascunho ou aprovada), mas atrás de um
  **type-to-confirm**: o botão de excluir só habilita quando a pessoa digita a palavra
  **`Delete`** (exata, após `trim`). Barreira deliberada contra exclusão acidental.
- **Duplicar** reaproveita a `duplicateCampaignAction` existente (que exige uma nova
  data-âncora).
- Cada ação abre um **modal leve** próprio, para consistência (o Excluir precisa de um
  de qualquer forma).

## Não-objetivos

- Sem migration: a exclusão se apoia no `on delete cascade` já existente
  (`campaign_touches`, `campaign_group_posts`, `chat_messages`, `scheduled_sends` e,
  transitivamente, `campaign_group_post_communities`).
- Sem tocar no caminho de envio, na fila ou no worker.
- Sem arquivar (soft-delete), sem busca/filtro/paginação da lista — ficam para depois.
- Sem contagem de envios pendentes no aviso de exclusão (o type-to-confirm já é a
  barreira; a contagem seria custo extra sem mudar a decisão).

## Escopo

### ① Server actions — `app/(app)/campanhas/actions.ts`

- `renameCampaignAction(campaignId: string, name: string): Promise<void>`
  - `const trimmed = name.trim(); if (!trimmed) throw new Error("O nome não pode ficar vazio.")`.
  - `update({ name: trimmed, updated_at: now })` em `campaigns` por `id`.
  - `revalidatePath("/campanhas")` e `revalidatePath(\`/campanhas/${campaignId}\`)`.
- `deleteCampaignAction(campaignId: string): Promise<void>`
  - `delete()` em `campaigns` por `id` (o cascade apaga toques/posts/chat/fila).
  - `revalidatePath("/campanhas")`.
  - Não checa status — a barreira é o type-to-confirm na UI. (A trava de envio é
    irrelevante aqui: excluir remove as linhas da fila; o worker nunca "revive" linha
    apagada.)
- `duplicateCampaignAction` — já existe, sem mudança.

### ② Componente — `app/(app)/campanhas/_components/campaign-row-menu.tsx` (novo, client)

Props: `{ campaignId: string; name: string }`.

Estado: `mode: null | "rename" | "duplicate" | "delete"`, `open` (dropdown), e os campos
de cada modal (`renameValue`, `dupAnchor`, `deleteConfirm`).

- **Botão ⋯**: `aria-haspopup="menu"`, abre/fecha o dropdown. Fecha ao clicar fora
  (listener no `document`) e ao `Escape`.
- **Dropdown**: itens Renomear / Duplicar / Excluir (o Excluir em cor de risco). Cada
  item fecha o dropdown e abre o modal correspondente (`setMode`).
- **Modal** (overlay `fixed inset-0` + painel centralizado; um wrapper local reaproveitado
  pelos três modos, com botão Cancelar e fechar no `Escape`):
  - **Renomear**: input pré-preenchido com `name`; "Salvar" chama
    `renameCampaignAction(campaignId, renameValue)` e fecha; desabilitado se vazio.
  - **Duplicar**: `input[type=datetime-local]` (`dupAnchor`); "Duplicar nesta data" chama
    `duplicateCampaignAction(campaignId, dupAnchor, "")` e `router.push(\`/campanhas/${novoId}\`)`;
    desabilitado sem data. (Mesmo fluxo do `DuplicateButton` atual.)
  - **Excluir**: mostra o `name` e o aviso ("Isso apaga a campanha e todos os envios já
    agendados dela. Pendentes são cancelados; o histórico de enviados some. Não tem
    desfazer."); input `deleteConfirm`; botão "Excluir definitivamente" (cor de risco)
    habilita só quando `deleteConfirm.trim() === "Delete"`; chama `deleteCampaignAction`
    e fecha (a lista se atualiza pelo `revalidatePath`).
- Todas as ações usam `useTransition` para o estado de "processando".

### ③ Lista — `app/(app)/campanhas/page.tsx`

- Adicionar uma coluna à direita: `<th>` vazio/curto no cabeçalho e, em cada linha, uma
  `<td>` alinhada à direita com `<CampaignRowMenu campaignId={c.id} name={c.name} />`.
- A página segue **server component**; o menu é a ilha client.

## Componentes tocados

| Arquivo | Mudança |
|---|---|
| `app/(app)/campanhas/actions.ts` | `renameCampaignAction`, `deleteCampaignAction` (①) |
| `app/(app)/campanhas/_components/campaign-row-menu.tsx` (novo) | menu ⋯ + 3 modais (②) |
| `app/(app)/campanhas/page.tsx` | coluna do menu na tabela (③) |

## Verificação

- **Typecheck** (`npx tsc --noEmit`) e **suíte** (`npx vitest run`) verdes — a mudança é
  UI + server actions, sem lógica pura nova relevante para unidade.
- **Manual (visual):** na lista, o ⋯ abre o menu; Renomear muda o nome e reflete na
  lista; Duplicar abre o seletor de data e navega para a cópia; Excluir só libera o botão
  ao digitar `Delete` e some a campanha da lista. Excluir uma campanha **aprovada** de
  teste e confirmar que suas linhas de `scheduled_sends` também somem (fila em
  `/disparos`).

## Riscos

- **Exclusão é irreversível e cascateia** — mitigado pelo type-to-confirm com a palavra
  `Delete`. Nenhuma outra proteção (é a decisão do produto).
- **Fechar dropdown ao clicar fora** — garantir cleanup do listener de `document` no
  `useEffect` para não vazar entre linhas.
- **Colisão de foco/teclado** entre dropdown e modal — abrir o modal fecha o dropdown
  antes (um `mode` por vez).
