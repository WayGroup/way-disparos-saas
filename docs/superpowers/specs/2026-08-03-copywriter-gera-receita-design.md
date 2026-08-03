# Copywriter gera receita pela conversa (tool)

**Data:** 2026-08-03
**Status:** aprovado, aguardando plano de implementação

## Contexto (visão maior)

Primeira fatia de um rumo mais amplo: dar "domínio" aos agentes de copy — que hoje só
geram texto — para que também **ajam** na ferramenta (criar receitas, alterar campanhas).
As capacidades foram decompostas em: **A** dar olhos ao copywriter, **B** copywriter
altera campanhas, **C** gerar receita pela conversa, **E** soltar a campanha da receita.
A receita **permanece central** e ganha um segundo caminho de autoria (conversa **ou** o
editor manual atual). Este spec cobre **C** — o padrão "agente com ferramenta de escrita"
que **B** vai reaproveitar.

## Problema

O chat do copywriter (`lib/ai/copy-chat.ts`) é uma ilha: responde **texto livre**, conhece
só a base de marca, e tem apenas as tools nativas da Anthropic (`web_search`/`web_fetch`).
Não sabe o formato de uma receita nem tem como criar uma. Montar uma receita hoje é só
pelo formulário manual (`recipe-editor.tsx`).

## Decisões (do brainstorming)

- **Gatilho agentic:** o modelo chama uma **tool customizada** `criar_receita` no meio da
  conversa quando a pessoa pede — não é um botão. Estabelece o padrão de "mãos".
- **Rascunho sempre revisado:** a receita nasce `active = false` (não aparece em "Nova
  campanha") e a resposta linka o **editor manual** para a pessoa ajustar e ativar. A IA
  propõe; um humano confirma. Nenhuma tela de revisão nova.
- **Escopo: só criar.** Editar receita existente pela conversa fica para depois.
- **Sem migration:** `recipes`/`recipe_inputs`/`recipe_slots`, a coluna `active` e o RPC
  `save_recipe` já existem.

## Não-objetivos

- Não editar receitas existentes pela conversa (só criar novas).
- Não gerar copy dentro da receita — receita é **esqueleto**, sem texto.
- Não tocar em campanhas, envio, fila, nem no chat de refino.
- Não trocar o modelo de saída do copywriter para JSON — ele continua conversacional; a
  escrita estruturada acontece **só** dentro da tool.

## Arquitetura

O copywriter ganha a tool `criar_receita`. O laço em `generateCopyReply` passa a tratar
`stop_reason === "tool_use"`: executa a tool (via um **executor injetado** pela action,
para o `lib/ai` não tocar no banco), devolve o `tool_result` e continua até o modelo
fechar com texto. O executor cria a receita rascunho reusando `save_recipe`.

```
sendCopyMessageAction (action, server)
  ├─ resolve rótulos dos links padrão (contexto)
  ├─ define o executor onCreateRecipe(draft) → cria rascunho via save_recipe
  └─ generateCopyReply(history, brandText, { linkLabels, onCreateRecipe })
        loop:
          stream → finalMessage()
          stop_reason === "tool_use"  → executa criar_receita, injeta tool_result, continua
          stop_reason === "pause_turn"→ (web_search/web_fetch, como hoje) continua
          senão                        → retorna { reply, createdRecipes }
  ← persiste a resposta do assistente + selo factual com link ao editor
```

## Escopo

### ① Tool + helpers puros — `lib/ai/recipe-tool.ts` (novo)

- **Tipo** `RecipeDraft`:
  ```ts
  type RecipeDraftInput = { label: string; field_type: "texto" | "data_hora" | "url" | "link" | "links_multi"; required: boolean; is_anchor: boolean };
  type RecipeDraftSlot = { track: "api" | "grupos"; role: string; offset_days: number; offset_time: string; offset_minutes: number; meta_category: "UTILITY" | "MARKETING" | null; suggested_media: string; code: string };
  type RecipeDraft = { name: string; description: string; inputs: RecipeDraftInput[]; slots: RecipeDraftSlot[] };
  ```
- **`CRIAR_RECEITA_TOOL`**: objeto da tool Anthropic — `name: "criar_receita"`,
  `description` curta (quando usar), e `input_schema` (JSON Schema) espelhando `RecipeDraft`
  com os enums de `field_type`/`track`/`meta_category`. `required` do schema: `name`,
  `inputs`, `slots` (description/code opcionais com default `""`).
- **`validateRecipeDraft(draft): { ok: true } | { ok: false; error: string }`** — regras
  semânticas que o schema não cobre:
  - ≥ 1 input; **exatamente um** `is_anchor === true`; a âncora deve ser `data_hora`.
  - ≥ 1 slot; todo slot da trilha `api` tem `meta_category` não-nulo.
  - a mensagem de erro é escrita para o **modelo** ler e corrigir (PT-BR, específica).
- **`toSaveRecipePayload(draft)`** — mapeia o draft para o payload do `save_recipe`, como
  **objetos planos** (sem importar tipos do `app/`, para o `lib/ai` seguir independente):
  `inputs: { label, field_type, required, is_anchor }[]` e `slots: { track, code, role,
  meta_category, target_communities, suggested_media, offset_days, offset_time,
  offset_minutes }[]`, preenchendo defaults (`offset_minutes ?? 0`, `code ?? ""`,
  `target_communities: null`, `offset_label: ""` — o editor deriva depois). A ordem dos
  arrays vira o `sort_order` (o RPC usa `with ordinality`).
- **`formatRecipeSeal(recipes: { id: string; name: string }[]): string`** — selo factual
  ("✓ Rascunho de receita criado: …") com link ao editor; `""` quando nada foi criado.

### ② Laço tool-use — `lib/ai/copy-chat.ts`

- Adicionar `CRIAR_RECEITA_TOOL` ao array `tools` (junto das nativas).
- Acrescentar ao `FREE_CHAT_SYSTEM_PROMPT` a orientação da tool: **só** chamar
  `criar_receita` quando a pessoa pedir para montar/gerar uma **receita** (modelo de
  campanha reutilizável); receita é esqueleto **sem copy**; exatamente um input é a âncora
  (`data_hora`, a data do evento); os offsets dos slots seguem o modelo relativo
  (`offset_days` + hora fixa **ou** `offset_minutes` a partir da hora do evento); a receita
  nasce como rascunho que a pessoa revisa. Injetar os `linkLabels` disponíveis para propor
  inputs de link coerentes.
- Nova assinatura:
  ```ts
  generateCopyReply(
    history, brandText,
    opts: {
      linkLabels?: string[];
      onCreateRecipe?: (draft: RecipeDraft) => Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }>;
    } = {},
  ): Promise<{ reply: string; createdRecipes: { id: string; name: string }[] }>
  ```
  (O retorno deixa de ser `string`.) No laço, ao ver `stop_reason === "tool_use"`: para cada
  bloco `tool_use` de nome `criar_receita`, parsear o input como `RecipeDraft`, chamar
  `onCreateRecipe`; empilhar o turno `assistant` (com o `resp.content`) e um turno `user`
  com os `tool_result` (`{ type: "tool_result", tool_use_id, content, is_error? }`);
  continuar. Acumular `createdRecipes` dos resultados `ok`. Tool desconhecida → `tool_result`
  de erro. Elevar o teto de iterações (4 → 6) por conta das rodadas extras.

### ③ Executor + persistência — `app/(app)/copywriter/actions.ts`

- Em `sendCopyMessageAction`: carregar os rótulos dos links (`listLinks()` de
  `lib/db/links.ts`) → `linkLabels`.
- Definir `onCreateRecipe(draft)`: `validateRecipeDraft` → se inválido devolve
  `{ ok:false, error }`; se válido, insere a linha `recipes` (`active:false`,
  `recipe_type:"custom"`, `name`), pega o id, chama o RPC `save_recipe(id, name, description,
  false, payload.inputs, payload.slots)`; devolve `{ ok:true, id, name }`. Erros do banco
  viram `{ ok:false, error }` (o modelo relata, nada quebra o chat).
- Chamar `generateCopyReply(history, brandText, { linkLabels, onCreateRecipe })`.
- Persistir a resposta do assistente como `reply + (createdRecipes.length ? "\n\n" +
  formatRecipeSeal(createdRecipes) : "")` — o link é **derivado no servidor**, não confiado
  ao texto do modelo. `revalidatePath("/receitas")` quando algo for criado.

### ④ UI — `app/(app)/copywriter/[id]/_components/copy-chat.tsx`

- Nenhuma peça nova. Confirmar que o render da mensagem do assistente exibe o link do selo
  de forma clicável (se hoje é texto puro, linkar `/receitas/…`; senão, o caminho aparece
  copiável). Detalhe fechado no plano ao ler o componente.

## Componentes tocados

| Arquivo | Mudança |
|---|---|
| `lib/ai/recipe-tool.ts` + teste (novos) | tool, `RecipeDraft`, `validateRecipeDraft`, `toSaveRecipePayload`, `formatRecipeSeal` (①) |
| `lib/ai/copy-chat.ts` | tool no array, laço `tool_use`, nova assinatura, orientação no prompt (②) |
| `app/(app)/copywriter/actions.ts` | executor + linkLabels + selo na persistência (③) |
| `app/(app)/copywriter/[id]/_components/copy-chat.tsx` | (se preciso) link clicável do selo (④) |

## Verificação

- **Unidade (TDD):** `validateRecipeDraft` (sem âncora / duas âncoras / âncora não-data /
  sem slot / api sem categoria / caso válido), `toSaveRecipePayload` (defaults e ordem →
  sort_order), `formatRecipeSeal` (vazio e com receita).
- **Integração (manual, precisa de `ANTHROPIC_API_KEY`):** numa conversa do copywriter,
  pedir "monta uma receita de webinário com convite D-1, lembrete no dia e um post durante a
  live". Conferir: o modelo chama a tool, a resposta traz o selo com link, a receita aparece
  em `/receitas` como **rascunho** (não em "Nova campanha"), abre no editor preenchida, e ao
  ativar passa a gerar campanha. Pedir copy avulsa e confirmar que a tool **não** é chamada.

## Riscos

- **Laço tool-use** é a parte delicada: uma rodada mal-encadeada trava a resposta. Cobrir o
  encadeamento assistant→tool_result e o teto de iterações; verificar na conversa real.
- **Modelo chamar a tool sem necessidade** (para copy avulsa): mitigado pela orientação no
  prompt; como a saída é sempre rascunho revisado, o custo de um falso positivo é baixo.
- **Draft inválido repetido:** o `validateRecipeDraft` devolve erro específico para o modelo
  corrigir; se estourar o teto de iterações, o chat responde o texto que houver sem gravar.
