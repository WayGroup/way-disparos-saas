# Remover "Comunidades" da receita — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o campo "Comunidades" do editor de receitas e a dica de comunidades do prompt — os grupos passam a ser escolhidos só por uma pessoa, na campanha.

**Architecture:** `describeSlots` deixa de emitir `comunidades-alvo` para a trilha grupos; o `SYSTEM_PROMPT` (compartilhado com o refino) manda a IA devolver `communities` vazio; o card do slot perde o campo e redistribui a linha. A coluna `target_communities` fica no banco, ignorada.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind + Vitest. PT-BR.

## Global Constraints

- **Sem migration.** `recipe_slots.target_communities` e `campaign_group_posts.communities` continuam existindo; nenhum campo sai do schema da IA.
- **Sem tocar no envio, na fila, nem no multi-select de grupos** (o mecanismo real de destino).
- **Sem mexer na trilha API** — a "Categoria Meta" segue igual.
- **Copy/prompt PT-BR**, voz Lucas Arruda; nunca "Wesley", preço ou tier.
- **Node vem do nvm:** se `node`/`npx` não existirem, rode antes `export NVM_DIR="$HOME/.nvm"; \. "$NVM_DIR/nvm.sh"`.

---

### Task 1: Prompt sem a dica de comunidades

**Files:**
- Modify: `lib/ai/prompt.ts` (`describeSlots` e `SYSTEM_PROMPT`)
- Modify: `lib/ai/prompt.test.ts` (asserção vira negativa)

**Interfaces:**
- Nenhuma assinatura muda: `describeSlots` e `buildGenerationUserPrompt` seguem com os mesmos parâmetros.

- [ ] **Step 1: `describeSlots` para de emitir a dica na trilha grupos**

Em `lib/ai/prompt.ts`, dentro de `describeSlots`, substituir:

```ts
      const extra = track === "api"
        ? `categoria Meta sugerida: ${s.meta_category ?? "UTILITY"}`
        : `comunidades-alvo: ${s.target_communities ?? ""}`;
      return `${i + 1}. [${s.offset_label}] ${s.role} — mídia sugerida: ${s.suggested_media} — ${extra}`;
```

por:

```ts
      // A trilha Grupos não recebe mais dica de público: quem escolhe os grupos de
      // destino é uma pessoa na ferramenta, no multi-select de cada peça.
      const extra = track === "api"
        ? ` — categoria Meta sugerida: ${s.meta_category ?? "UTILITY"}`
        : "";
      return `${i + 1}. [${s.offset_label}] ${s.role} — mídia sugerida: ${s.suggested_media}${extra}`;
```

- [ ] **Step 2: Regra do `communities` vazio no `SYSTEM_PROMPT`**

Ainda em `lib/ai/prompt.ts`, substituir a linha da trilha de Grupos:

```
- Trilha de Grupos: um post único (copy + mídia) para as comunidades indicadas, sem template/janela/fallback.
```

por:

```
- Trilha de Grupos: um post único (copy + mídia), sem template/janela/fallback. O campo "communities" deve vir SEMPRE vazio (""): quem escolhe os grupos de destino é uma pessoa na ferramenta, não você.
```

- [ ] **Step 3: Travar a regressão no teste do prompt**

Em `lib/ai/prompt.test.ts`, substituir a linha 25:

```ts
    expect(out).toContain("1, 2, 3"); // comunidades do slot de grupo
```

por (asserção negativa + prova de que o slot de grupo continua descrito):

```ts
    expect(out).not.toContain("1, 2, 3"); // a dica de comunidades saiu do prompt
    expect(out).toContain("Vídeo convite"); // o slot de grupo segue descrito (mídia sugerida)
```

- [ ] **Step 4: Rodar o teste do prompt**

Run: `npx vitest run lib/ai/prompt.test.ts`
Expected: PASS — a asserção negativa passa porque `target_communities` não é mais impresso.

- [ ] **Step 5: Typecheck + suíte inteira**

Run: `npx tsc --noEmit` → sem erros
Run: `npx vitest run` → PASS

- [ ] **Step 6: Commit**

```bash
git add lib/ai/prompt.ts lib/ai/prompt.test.ts
git commit -m "feat: prompt sem dica de comunidades; IA devolve communities vazio"
```

---

### Task 2: Campo "Comunidades" sai do editor

**Files:**
- Modify: `app/(app)/receitas/[id]/_components/recipe-editor.tsx`

**Interfaces:**
- Consumes: nada novo. `SaveSlot.target_communities` continua no tipo (`app/(app)/receitas/actions.ts`), apenas deixa de ter campo na UI.

- [ ] **Step 1: Remover o campo e redistribuir a linha**

Em `app/(app)/receitas/[id]/_components/recipe-editor.tsx`, na **segunda** linha do card do slot (a que começa com `<div className="grid grid-cols-12 gap-3 items-end mt-3">`), substituir do `<label className="col-span-6">` de "Mídia sugerida" até o fechamento do bloco condicional `)}` por:

```tsx
                <label className={track === "api" ? "col-span-6" : "col-span-9"}><span className="text-[10px] font-mono uppercase text-muted">Mídia sugerida</span>
                  <input value={s.suggested_media} onChange={(e) => patchSlot(idx, { suggested_media: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                {track === "api" && (
                  <label className="col-span-3"><span className="text-[10px] font-mono uppercase text-muted">Categoria Meta</span>
                    <select value={s.meta_category ?? "UTILITY"} onChange={(e) => patchSlot(idx, { meta_category: e.target.value as "UTILITY" | "MARKETING" })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm">
                      <option value="UTILITY">UTILITY</option>
                      <option value="MARKETING">MARKETING</option>
                    </select></label>
                )}
```

O `<label>` de "Código" (`col-span-3`) que vem logo depois **permanece inalterado**. Resultado: a linha soma 12 colunas nas duas trilhas (api: 6+3+3; grupos: 9+3).

- [ ] **Step 2: Slot novo de grupo nasce sem comunidades**

No `onClick` do botão "+ Adicionar slot", no ramo da trilha grupos, trocar:

```tsx
target_communities: "1, 2, 3",
```

por:

```tsx
target_communities: null,
```

(O ramo da trilha api já usa `target_communities: null` — não mexer nele.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Suíte**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Verificação manual (visual)**

Subir o app (`npm run dev`) e conferir:
- Numa receita, aba **Grupos**: o campo "Comunidades" sumiu e "Mídia sugerida" ficou mais larga; aba **API**: "Categoria Meta" segue lá.
- Adicionar um slot de grupo e **Salvar** sem erro.
- Gerar uma campanha e conferir que os posts **não** exibem mais "Sugestão da IA: …", e que o multi-select de grupos da peça continua funcionando.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/receitas/[id]/_components/recipe-editor.tsx"
git commit -m "feat: campo Comunidades sai do editor de receitas"
```

---

## Self-Review

**Spec coverage:**
- ① `describeSlots` sem `comunidades-alvo` na trilha grupos → Task 1, Step 1. ✔
- ① Regra do `communities` vazio no `SYSTEM_PROMPT` (vale também no refino, que compartilha o prompt) → Task 1, Step 2. ✔
- ② Asserção negativa em `prompt.test.ts` → Task 1, Step 3. ✔
- ③ Campo removido do editor + grid redistribuído → Task 2, Step 1. ✔
- ③ Slot novo de grupo com `target_communities: null` → Task 2, Step 2. ✔
- ③ Slots existentes mantêm o valor em estado e o gravam de volta inalterado → consequência de não mexer na hidratação nem no `save()`; nada a fazer. ✔
- Sem migration / sem tocar no envio → Global Constraints. ✔

**Placeholder scan:** todo step tem código/comando real e output esperado. Sem TBD/TODO.

**Type consistency:** nenhuma assinatura muda. `SaveSlot.target_communities` continua `string | null`; o ramo grupos passa a usar `null`, que já é aceito pelo tipo (o ramo api já usava). O `className` condicional em `<label>` é `string` nos dois casos. `describeSlots` segue `(slots: RecipeSlot[], track: "api" | "grupos") => string`.
