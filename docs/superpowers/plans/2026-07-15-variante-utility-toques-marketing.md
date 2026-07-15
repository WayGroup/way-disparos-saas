# Variante UTILITY nos toques MARKETING — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Para todo toque MARKETING da trilha API, gerar e exibir uma versão UTILITY alternativa completa (corpo transacional + botões próprios + risco), pronta pra submeter ao Meta.

**Architecture:** Uma coluna `utility_alt jsonb` (nullable) em `campaign_touches` guarda a variante. A IA (geração e refino compartilham o `SYSTEM_PROMPT`) produz o `utility_alt` para toques MARKETING e `null` para UTILITY. O card do toque exibe o bloco alternativo com copiar + nome sugerido. Duplicar copia a coluna.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind + Supabase (jsonb) + Vitest. IA via Claude, output json_schema. PT-BR.

## Global Constraints

- **Migration aditiva e nullable.** `utility_alt jsonb` default `null`; campanhas existentes ficam sem alternativa, coerente. A aplicação da migration ao Supabase remoto é feita pelo controlador (MCP `apply_migration`), não pelo subagente — o subagente só cria o arquivo SQL.
- **Direção única:** MARKETING → gera `utility_alt`; UTILITY → `utility_alt = null`. Nunca o contrário.
- **Sem tocar na trilha Grupos, na fila, nem no caminho de envio.**
- **Copy/prompt PT-BR.** Voz do prompt: Lucas Arruda, 1ª pessoa, sem hype; nunca citar "Wesley", preço ou tier.
- **Shape do `utility_alt`:** `{ template_body: string; buttons: { type: "quick_reply" | "url"; text: string; url: string }[]; risk_flag: boolean } | null`. O MESMO shape em types, schema (geração e refino) e TouchFields.
- **Node vem do nvm:** se `node`/`npx` não existirem, rode antes `export NVM_DIR="$HOME/.nvm"; \. "$NVM_DIR/nvm.sh"`.

---

### Task 1: Migration + tipo + helper `utilityAltName`

Base do recurso: a coluna, o tipo `CampaignTouch.utility_alt`, o helper do nome sugerido, e o ajuste do único fixture de teste que constrói um toque (o campo novo é obrigatório).

**Files:**
- Create: `supabase/migrations/0022_utility_alt.sql`
- Modify: `lib/db/types.ts` (`CampaignTouch`)
- Modify: `lib/ai/refine-prompt.test.ts` (fixture do toque ganha `utility_alt: null`)
- Create: `lib/campaign-touch.ts`, `lib/campaign-touch.test.ts`

**Interfaces:**
- Produces: `utilityAltName(templateName: string): string`
- Produces (tipo): `CampaignTouch.utility_alt` (shape do Global Constraints).

- [ ] **Step 1: Criar a migration**

Criar `supabase/migrations/0022_utility_alt.sql`:

```sql
-- Variante UTILITY alternativa de um toque MARKETING: o mesmo recado reescrito para
-- passar como UTILITY no Meta, com botões próprios e seu risco de reclassificação.
-- null = toque sem alternativa (é UTILITY, ou não foi gerada).
alter table public.campaign_touches
  add column if not exists utility_alt jsonb;
```

- [ ] **Step 2: Adicionar o campo ao tipo `CampaignTouch`**

Em `lib/db/types.ts`, no `type CampaignTouch`, adicionar após a linha `send_at: string;`:

```ts
  utility_alt: {
    template_body: string;
    buttons: { type: "quick_reply" | "url"; text: string; url: string }[];
    risk_flag: boolean;
  } | null;
```

- [ ] **Step 3: Ajustar o fixture do teste do refino (campo obrigatório novo)**

Em `lib/ai/refine-prompt.test.ts`, o objeto do toque (`touches: [{ id: "t1", ... send_at: "" }]`, ~linha 9) passa a precisar do campo. Adicionar `utility_alt: null,` dentro desse objeto (antes de `send_at: ""` está ok):

```ts
    { id: "t1", campaign_id: "c", sort_order: 0, offset_label: "-3 dias", role: "Convite", template_name: "", meta_category: "UTILITY", template_body: "Oi {{1}}", buttons: [{ type: "quick_reply", text: "Quero o link", url: "" }], window_steps: [{ media: "Vídeo", caption: "boas-vindas" }], fallback_copy: "Tranquilo", crm_action: "tag inscrito", risk_flag: false, utility_alt: null, send_at: "" },
```

- [ ] **Step 4: Escrever o teste do helper (que falha)**

Criar `lib/campaign-touch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { utilityAltName } from "@/lib/campaign-touch";

describe("utilityAltName", () => {
  it("acrescenta _util quando há nome", () => {
    expect(utilityAltName("webinario_convite_2807")).toBe("webinario_convite_2807_util");
  });
  it("vazio quando o nome é vazio", () => {
    expect(utilityAltName("")).toBe("");
  });
});
```

- [ ] **Step 5: Rodar e confirmar que falha**

Run: `npx vitest run lib/campaign-touch.test.ts`
Expected: FAIL — `Cannot find module '@/lib/campaign-touch'`.

- [ ] **Step 6: Implementar o helper**

Criar `lib/campaign-touch.ts`:

```ts
/** Nome sugerido do template UTILITY alternativo, derivado do nome do toque. */
export function utilityAltName(templateName: string): string {
  return templateName ? `${templateName}_util` : "";
}
```

- [ ] **Step 7: Rodar helper + typecheck + suíte**

Run: `npx vitest run lib/campaign-touch.test.ts` → PASS
Run: `npx tsc --noEmit` → sem erros (o fixture ajustado satisfaz o novo campo obrigatório)
Run: `npx vitest run` → PASS (suíte inteira)

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0022_utility_alt.sql lib/db/types.ts lib/ai/refine-prompt.test.ts lib/campaign-touch.ts lib/campaign-touch.test.ts
git commit -m "feat: coluna utility_alt + tipo + helper utilityAltName"
```

> **Nota de execução (controlador):** após esta task, aplicar a migration `0022` ao Supabase via MCP `apply_migration` e conferir a coluna com `list_tables`. Não é passo do subagente.

---

### Task 2: Geração — schema + prompt

A IA passa a produzir o `utility_alt` na geração. O schema do toque ganha o objeto nullable; o `SYSTEM_PROMPT` ganha a regra (que também vale no refino, pois é compartilhado).

**Files:**
- Modify: `lib/ai/schema.ts` (item de `touches`)
- Modify: `lib/ai/prompt.ts` (`SYSTEM_PROMPT`)

**Interfaces:**
- Consumes: shape do `utility_alt` (Global Constraints).

- [ ] **Step 1: Adicionar `utility_alt` ao schema de geração**

Em `lib/ai/schema.ts`, no item de `touches`: incluir `"utility_alt"` no array `required` do toque (a lista que hoje é `["offset_label", "role", "meta_category", "template_body", "buttons", "window_steps", "fallback_copy", "crm_action", "risk_flag"]`), passando a terminar em `..., "risk_flag", "utility_alt"`.

E, dentro de `properties` do toque, após a propriedade `risk_flag: { type: "boolean" }`, inserir:

```ts
          utility_alt: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["template_body", "buttons", "risk_flag"],
            properties: {
              template_body: { type: "string" },
              buttons: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["type", "text", "url"],
                  properties: {
                    type: { type: "string", enum: ["quick_reply", "url"] },
                    text: { type: "string" },
                    url: { type: "string" },
                  },
                },
              },
              risk_flag: { type: "boolean" },
            },
          },
```

- [ ] **Step 2: Adicionar a regra ao `SYSTEM_PROMPT`**

Em `lib/ai/prompt.ts`, dentro da lista "Regras inegociáveis", logo após a linha que começa com `- Marque risk_flag = true`, inserir o bullet:

```ts
- Para TODO toque MARKETING, gere também "utility_alt": o MESMO recado reescrito em enquadramento UTILITY (transacional e informativo — foca na informação e na expectativa que o lead já tem; sem oferta, urgência ou gatilho promocional), com botões próprios TRANSACIONAIS ("Ver detalhes", "Confirmar", "Abrir" — nunca "Quero a vaga"/"Comprar"), e risk_flag=true quando a versão ainda soar promocional demais para passar como UTILITY. Para toque UTILITY, "utility_alt" = null.
```

- [ ] **Step 3: Typecheck + suíte**

Run: `npx tsc --noEmit` → sem erros
Run: `npx vitest run` → PASS. (`lib/ai/prompt.test.ts` testa o *user prompt* de `buildGenerationUserPrompt`, não o texto do `SYSTEM_PROMPT`, então a regra nova não o afeta.)

- [ ] **Step 4: Commit**

```bash
git add lib/ai/schema.ts lib/ai/prompt.ts
git commit -m "feat: geracao produz utility_alt para toques MARKETING"
```

---

### Task 3: Refino — schema + tipos + prompt

O refino carrega o `utility_alt` nos toques editados e novos, e o prompt mostra o estado atual da alternativa.

**Files:**
- Modify: `lib/ai/refine-schema.ts` (itens de `touch_updates` e `new_touches`)
- Modify: `lib/ai/refine.ts` (`TouchUpdate`, `NewTouch`)
- Modify: `lib/ai/refine-prompt.ts` (listagem + instrução)

**Interfaces:**
- Consumes: shape do `utility_alt` (Global Constraints); `RefineResult` já existente.

- [ ] **Step 1: `utility_alt` no schema do refino**

Em `lib/ai/refine-schema.ts`, no item de `touch_updates` **e** no item de `new_touches`: incluir `"utility_alt"` no `required` de cada, e inserir a mesma propriedade `utility_alt` usada na Task 2 (o objeto `type: ["object","null"]` com `template_body`/`buttons`/`risk_flag`) dentro de `properties` de cada item, após `risk_flag`.

```ts
          utility_alt: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["template_body", "buttons", "risk_flag"],
            properties: {
              template_body: { type: "string" },
              buttons: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["type", "text", "url"],
                  properties: {
                    type: { type: "string", enum: ["quick_reply", "url"] },
                    text: { type: "string" },
                    url: { type: "string" },
                  },
                },
              },
              risk_flag: { type: "boolean" },
            },
          },
```

- [ ] **Step 2: `utility_alt` nos tipos `TouchUpdate` e `NewTouch`**

Em `lib/ai/refine.ts`, adicionar a `TouchUpdate` e a `NewTouch` o campo (mesmo shape do Global Constraints):

```ts
  utility_alt: {
    template_body: string;
    buttons: { type: "quick_reply" | "url"; text: string; url: string }[];
    risk_flag: boolean;
  } | null;
```

- [ ] **Step 3: Mostrar o `utility_alt` no prompt do refino**

Em `lib/ai/refine-prompt.ts`, na função `buildRefinePrompt`, na linha do map de `touches`, acrescentar ao final da string de cada toque (após o trecho `crm: ... risco: ...`):

```ts
\n  versão UTILITY (utility_alt): ${t.utility_alt ? t.utility_alt.template_body : "(nenhuma)"}
```

E, no bloco de instruções ao final do prompt (após a linha das instruções de adicionar peças), acrescentar:

```
\n- Toque MARKETING deve manter/gerar "utility_alt" (a versão UTILITY alternativa); toque UTILITY → "utility_alt": null.
```

- [ ] **Step 4: Typecheck + suíte**

Run: `npx tsc --noEmit` → sem erros
Run: `npx vitest run` → PASS. (O fixture do `refine-prompt.test.ts` já recebeu `utility_alt: null` na Task 1, então `t.utility_alt ? ... : "(nenhuma)"` resolve para "(nenhuma)".)

- [ ] **Step 5: Commit**

```bash
git add lib/ai/refine-schema.ts lib/ai/refine.ts lib/ai/refine-prompt.ts
git commit -m "feat: refino carrega utility_alt nos toques (update e novos)"
```

---

### Task 4: UI do card + duplicar

Exibir a alternativa no card do toque (com copiar + nome sugerido + risco), permitir editar o corpo dela, e preservar na duplicação.

**Files:**
- Modify: `app/(app)/campanhas/[id]/_components/touch-card.tsx`
- Modify: `app/(app)/campanhas/actions.ts` (`TouchFields` + `duplicateCampaignAction`)

**Interfaces:**
- Consumes: `utilityAltName` (Task 1); `CampaignTouch.utility_alt` (Task 1).

- [ ] **Step 1: `TouchFields` ganha `utility_alt`**

Em `app/(app)/campanhas/actions.ts`, no `export type TouchFields`, adicionar após `template_name: string;`:

```ts
  utility_alt: {
    template_body: string;
    buttons: { type: "quick_reply" | "url"; text: string; url: string }[];
    risk_flag: boolean;
  } | null;
```

(`updateTouchAction` já faz `.update(fields)`, então a coluna é persistida sem outra mudança.)

- [ ] **Step 2: Preservar `utility_alt` na duplicação**

Em `app/(app)/campanhas/actions.ts`, no `duplicateCampaignAction`, no `.map` de `src.touches` (o objeto que começa em `campaign_id: newId, sort_order: t.sort_order,`), adicionar o campo:

```ts
        utility_alt: t.utility_alt,
```

(colocar junto aos demais campos copiados, ex. logo após `risk_flag: t.risk_flag,`).

- [ ] **Step 3: Importar o helper e inicializar o form no `touch-card.tsx`**

Em `app/(app)/campanhas/[id]/_components/touch-card.tsx`:

Adicionar o import:

```ts
import { utilityAltName } from "@/lib/campaign-touch";
```

E, no `useState<TouchFields>` inicial, adicionar `utility_alt: touch.utility_alt,` ao objeto (junto aos outros campos, ex. após `template_name: touch.template_name,`).

- [ ] **Step 4: Bloco de visualização da alternativa**

Em `touch-card.tsx`, no modo de visualização, logo APÓS o `</section>` que fecha o bloco "Template · pago" (o que contém `{touch.template_body}` e os `touch.buttons`) e ANTES do comentário `{/* janela 24h */}`, inserir:

```tsx
          {/* versão UTILITY alternativa */}
          {touch.utility_alt && touch.utility_alt.template_body && (
            <section className="group rounded-xl border border-line p-4">
              <div className="flex items-center justify-between border-b border-line pb-2 mb-3">
                <div className="font-mono text-[11px] uppercase tracking-widest text-utility">Versão UTILITY <span className="text-muted">· alternativa</span></div>
                <div className="flex items-center gap-2 shrink-0">
                  {touch.utility_alt.risk_flag && <span className="rounded-full bg-risk/15 text-risk text-[11px] font-mono px-2 py-0.5">⚠ risco reclassificação</span>}
                  <CopyButton text={touch.utility_alt.template_body} label="copiar texto" className={COPY_REVEAL} />
                </div>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{touch.utility_alt.template_body}</p>
              {touch.utility_alt.buttons.length > 0 && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {touch.utility_alt.buttons.map((b, bi) => (
                    <span key={bi} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-xs">
                      <span>{b.type === "url" ? "🔗" : "↩"}</span>
                      <span>{b.text}</span>
                      {b.type === "url" && b.url && <a href={b.url} target="_blank" rel="noreferrer" className="text-emeraldd underline truncate max-w-[160px]">{b.url}</a>}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="font-mono text-muted">nome sugerido:</span>
                <span className="font-mono bg-paper border border-line rounded px-2 py-0.5">{utilityAltName(touch.template_name)}</span>
                <CopyButton text={utilityAltName(touch.template_name)} label="copiar nome" />
              </div>
            </section>
          )}
```

- [ ] **Step 5: Textarea de edição do corpo da alternativa**

Em `touch-card.tsx`, no modo de edição (o `return (...)` do formulário), logo APÓS o `<label>` do checkbox "marcar risco de reclassificação" e ANTES do `<p>` "A janela de 24h (mídias) é ajustada pelo chat de refino.", inserir:

```tsx
      {f.utility_alt && (
        <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Corpo da versão UTILITY</span><textarea value={f.utility_alt.template_body} onChange={(e) => setF({ ...f, utility_alt: f.utility_alt ? { ...f.utility_alt, template_body: e.target.value } : null })} rows={3} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      )}
```

- [ ] **Step 6: Typecheck + suíte**

Run: `npx tsc --noEmit` → sem erros
Run: `npx vitest run` → PASS (sem cobertura de unidade nova; a mudança é UI/action).

- [ ] **Step 7: Verificação manual (visual + integração)**

Precisa da migration `0022` aplicada e da `ANTHROPIC_API_KEY`. Gerar uma campanha (receita "Webinário quinzenal", que tem toques MARKETING). Conferir:
- Cada toque **MARKETING** mostra o bloco "Versão UTILITY · alternativa" com corpo transacional, botões próprios, nome `_util` e o selo de risco quando aplicável.
- Toques **UTILITY** não mostram o bloco.
- No Editar de um toque com alternativa, o textarea "Corpo da versão UTILITY" salva.
- Duplicar a campanha preserva as alternativas.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/campanhas/[id]/_components/touch-card.tsx" "app/(app)/campanhas/actions.ts"
git commit -m "feat: card do toque exibe/edita a versao UTILITY + duplicar preserva"
```

---

## Self-Review

**Spec coverage:**
- ① Migration `0022` (`utility_alt jsonb`) → Task 1. ✔
- ② `CampaignTouch.utility_alt` → Task 1. ✔
- ③ Geração (schema nullable + regra no `SYSTEM_PROMPT`) → Task 2. ✔
- ④ Refino (schema em touch_updates+new_touches, tipos, prompt) → Task 3. ✔
- ⑤ UI (bloco de visualização + textarea + nome sugerido) → Task 4, Steps 3-5. ✔
- ⑥ Duplicar preserva → Task 4, Step 2. ✔
- ⑦ Helper `utilityAltName` + teste → Task 1. ✔
- Aplicação da migration ao Supabase → nota de execução do controlador após Task 1. ✔

**Placeholder scan:** todo step tem código/comando real e output esperado. Sem TBD/TODO.

**Type consistency:** o shape `{ template_body: string; buttons: {type,text,url}[]; risk_flag: boolean } | null` é idêntico em `CampaignTouch` (Task 1), no schema de geração e refino (Tasks 2-3, via json-schema equivalente), em `TouchUpdate`/`NewTouch` (Task 3) e em `TouchFields` (Task 4). `utilityAltName(templateName: string): string` definido na Task 1, consumido na Task 4. O campo obrigatório novo em `CampaignTouch` quebraria o fixture de `refine-prompt.test.ts` — corrigido na mesma Task 1 (Step 3), mantendo tsc/suíte verdes a cada fronteira de task.
