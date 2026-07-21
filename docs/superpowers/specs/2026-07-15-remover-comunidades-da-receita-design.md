# Remover "Comunidades" da receita

**Data:** 2026-07-15
**Status:** aprovado, aguardando plano de implementação

## Problema

O slot de receita da trilha Grupos tem um campo **Comunidades** (`target_communities`,
texto livre tipo `"1, 2, 3"`) que **não seleciona grupo nenhum**. Ele só vira uma dica
textual no prompt (`describeSlots` → `comunidades-alvo: …`), a IA devolve outro texto em
`group_posts.communities`, e esse texto aparece como *"Sugestão da IA"* no card da peça.

Os grupos de verdade são escolhidos **depois**, por uma pessoa: na criação da campanha e
no multi-select de cada peça, que gravam o vínculo relacional (`community_ids`).

O campo, portanto, promete o que não cumpre — parece definir destino, mas não define.

## Decisões (do brainstorming)

- Remover o campo **do editor de receitas E do prompt**. A IA deixa de receber a dica e
  passa a devolver `communities` vazio; quem escolhe os grupos é sempre a pessoa.
- A coluna `target_communities` **permanece no banco**, sem migration. Ela deixa de ser
  exibida e deixa de alimentar o prompt; valores antigos continuam gravados e ignorados.

## Não-objetivos

- Sem migration; sem remover colunas (`recipe_slots.target_communities`,
  `campaign_group_posts.communities`) nem campos do schema da IA.
- Sem tocar no envio, na fila, nem no multi-select de grupos (o mecanismo real).
- Sem mexer na trilha API (a "Categoria Meta" continua como está).

## Escopo

### ① Prompt — `lib/ai/prompt.ts`

- **`describeSlots`**: os slots da trilha **grupos** deixam de emitir
  `comunidades-alvo: …`. A linha do slot passa a terminar na mídia sugerida. Os slots de
  **api** continuam emitindo `categoria Meta sugerida: …`.
- **`SYSTEM_PROMPT`**: nova regra — o campo `communities` dos posts de grupo deve vir
  **sempre vazio (`""`)**, porque quem escolhe os grupos de destino é uma pessoa na
  ferramenta. (A regra vale também para o refino, que compartilha este prompt.)

Efeito colateral desejado: como o card da peça só renderiza a linha *"Sugestão da IA"*
quando `post.communities` tem texto, ela desaparece sozinha.

### ② Teste do prompt — `lib/ai/prompt.test.ts`

A asserção `expect(out).toContain("1, 2, 3")` (linha 25) passa a ser **negativa**,
travando a regressão: a dica de comunidades não pode voltar ao prompt.

### ③ Editor — `app/(app)/receitas/[id]/_components/recipe-editor.tsx`

- O campo **Comunidades** sai do card do slot.
- A segunda linha do card se redistribui: `Mídia sugerida` ocupa **col-span-9** na trilha
  grupos e **col-span-6** na api (onde divide espaço com `Categoria Meta`, col-span-3);
  `Código` segue em col-span-3 nas duas.
- Slot novo da trilha grupos nasce com `target_communities: null` (antes `"1, 2, 3"`).
- Slots existentes mantêm o valor guardado em estado e o gravam de volta inalterado —
  nada é apagado, apenas deixa de ser exibido e usado.

## Componentes tocados

| Arquivo | Mudança |
|---|---|
| `lib/ai/prompt.ts` | `describeSlots` sem a dica de comunidades + regra de `communities` vazio (①) |
| `lib/ai/prompt.test.ts` | asserção negativa travando a regressão (②) |
| `app/(app)/receitas/[id]/_components/recipe-editor.tsx` | campo removido, grid redistribuído, slot novo com `null` (③) |

## Verificação

- **Unidade:** `npx vitest run` verde, com a asserção negativa de `prompt.test.ts`
  provando que a dica saiu. `npx tsc --noEmit` limpo.
- **Manual (visual):** abrir uma receita → a trilha Grupos não mostra mais o campo
  Comunidades e a Mídia sugerida ficou mais larga; adicionar um slot de grupo e salvar
  sem erro. Gerar uma campanha e conferir que os posts **não** exibem mais
  *"Sugestão da IA: …"*, e que o multi-select de grupos segue funcionando normalmente.

## Riscos

- **A IA pode ignorar a regra e devolver texto em `communities`.** Nesse caso a linha
  "Sugestão da IA" reaparece — cosmético, sem efeito no destino real do disparo.
  Verificável na geração manual.
- **Perda da dica de público na copy.** Sem `comunidades-alvo`, a IA não sabe para qual
  recorte de público escrever. Aceito: o `role` do slot já carrega o objetivo, e a
  seleção real de grupos nunca dependeu desse texto.
