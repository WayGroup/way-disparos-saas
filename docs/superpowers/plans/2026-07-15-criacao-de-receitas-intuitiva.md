# Criação de receitas mais intuitiva — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a criação de receitas intuitiva: rótulo do offset derivado (fim da divergência), receita nova já com os campos padrão, card do slot legível, código automático e slot novo herdando o tempo do anterior.

**Architecture:** Três helpers puros novos em `lib/recipe-slots.ts` (rótulo derivado, código do papel, padrão do slot novo). `createRecipeAction` passa a inserir os dois inputs padrão (com rollback se falhar). O `RecipeEditor` deixa de ter o campo "Offset" digitável, ganha layout em duas linhas por slot, hora como `<input type="time">`, código como placeholder derivado, e normaliza `offset_label`/`code` no save.

**Tech Stack:** Next.js (App Router, server actions) + TypeScript + Tailwind + Supabase + Vitest. PT-BR.

## Global Constraints

- **Sem migration.** As colunas `offset_label`, `offset_days`, `offset_time`, `code` e a tabela `recipe_inputs` já existem.
- **Sem tocar no envio, na fila, na geração de campanha nem no prompt.**
- **`offset_label` continua existindo e sendo gravado** — agora sempre derivado, nunca digitado.
- **Formato do rótulo:** `D0`, `D-3`, `D+2`; com hora, ` · 14h` (minutos `00`) ou ` · 19h07`.
- **Copy PT-BR.**
- **Node vem do nvm:** se `node`/`npx` não existirem, rode antes `export NVM_DIR="$HOME/.nvm"; \. "$NVM_DIR/nvm.sh"`.

---

### Task 1: Helpers puros — `lib/recipe-slots.ts`

**Files:**
- Create: `lib/recipe-slots.ts`
- Test: `lib/recipe-slots.test.ts`

**Interfaces:**
- Produces:
  - `formatOffsetLabel(days: number, time: string): string`
  - `codeFromRole(role: string): string`
  - `nextSlotDefaults(last: { offset_days: number; offset_time: string } | undefined): { offset_days: number; offset_time: string }`
- Consumes: `slugifyIdentifier` de `@/lib/text`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `lib/recipe-slots.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatOffsetLabel, codeFromRole, nextSlotDefaults } from "@/lib/recipe-slots";

describe("formatOffsetLabel", () => {
  it("dia negativo com hora cheia", () => expect(formatOffsetLabel(-1, "14:00")).toBe("D-1 · 14h"));
  it("dia zero com hora cheia", () => expect(formatOffsetLabel(0, "09:00")).toBe("D0 · 09h"));
  it("hora quebrada mantém os minutos", () => expect(formatOffsetLabel(0, "19:07")).toBe("D0 · 19h07"));
  it("dia positivo sem hora", () => expect(formatOffsetLabel(2, "")).toBe("D+2"));
  it("dia zero sem hora", () => expect(formatOffsetLabel(0, "")).toBe("D0"));
  it("hora inválida é ignorada", () => expect(formatOffsetLabel(-3, "14h")).toBe("D-3"));
});

describe("codeFromRole", () => {
  it("papel vira slug", () => expect(codeFromRole("Convite — reserve sua vaga")).toBe("convite-reserve-sua-vaga"));
  it("vazio continua vazio", () => expect(codeFromRole("")).toBe(""));
});

describe("nextSlotDefaults", () => {
  it("sem último slot → dia 0 às 10:00", () =>
    expect(nextSlotDefaults(undefined)).toEqual({ offset_days: 0, offset_time: "10:00" }));
  it("herda dia e hora do último", () =>
    expect(nextSlotDefaults({ offset_days: -1, offset_time: "14:00" })).toEqual({ offset_days: -1, offset_time: "14:00" }));
  it("último sem hora → 10:00", () =>
    expect(nextSlotDefaults({ offset_days: 3, offset_time: "" })).toEqual({ offset_days: 3, offset_time: "10:00" }));
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/recipe-slots.test.ts`
Expected: FAIL — `Cannot find module '@/lib/recipe-slots'`.

- [ ] **Step 3: Implementar os helpers**

Criar `lib/recipe-slots.ts`:

```ts
import { slugifyIdentifier } from "@/lib/text";

const TIME_RE = /^(\d{2}):(\d{2})$/;

/**
 * Rótulo humano do offset, DERIVADO dos campos que de fato agendam
 * (offset_days + offset_time). Antes era texto livre e divergia do agendamento real.
 */
export function formatOffsetLabel(days: number, time: string): string {
  const dia = days === 0 ? "D0" : days < 0 ? `D${days}` : `D+${days}`;
  const m = time.match(TIME_RE);
  if (!m) return dia;
  const [, hh, mm] = m;
  return mm === "00" ? `${dia} · ${hh}h` : `${dia} · ${hh}h${mm}`;
}

/** Código do slot derivado do papel, para quando a pessoa não escreve um próprio. */
export function codeFromRole(role: string): string {
  return slugifyIdentifier(role);
}

/** Tempo sugerido para um slot novo: herda do último slot da mesma trilha. */
export function nextSlotDefaults(
  last: { offset_days: number; offset_time: string } | undefined,
): { offset_days: number; offset_time: string } {
  if (!last) return { offset_days: 0, offset_time: "10:00" };
  return { offset_days: last.offset_days, offset_time: last.offset_time || "10:00" };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/recipe-slots.test.ts`
Expected: PASS (11 testes).

- [ ] **Step 5: Suíte inteira + typecheck**

Run: `npx vitest run` → PASS
Run: `npx tsc --noEmit` → sem erros

- [ ] **Step 6: Commit**

```bash
git add lib/recipe-slots.ts lib/recipe-slots.test.ts
git commit -m "feat: helpers de slot de receita (rotulo derivado, codigo, padrao do novo)"
```

---

### Task 2: Receita nova nasce com os campos padrão

**Files:**
- Modify: `app/(app)/receitas/actions.ts` (`createRecipeAction`)

**Interfaces:**
- Consumes: `createServerSupabase`, `revalidatePath` (já importados no arquivo).

- [ ] **Step 1: Inserir os inputs padrão na criação**

Em `app/(app)/receitas/actions.ts`, substituir a função `createRecipeAction` inteira por:

```ts
export async function createRecipeAction(): Promise<string> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("recipes")
    .insert({ name: "Nova receita", recipe_type: "custom" })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar receita: ${error.message}`);
  const id = data.id as string;

  // Toda receita nasce com os dois campos que o agendamento exige: um nome interno
  // e a data-âncora (sem âncora, computeSendAt não tem de onde partir).
  const { error: eInputs } = await supabase.from("recipe_inputs").insert([
    { recipe_id: id, label: "Nome interno", field_type: "texto", required: true, is_anchor: false, sort_order: 0 },
    { recipe_id: id, label: "Data e hora do evento", field_type: "data_hora", required: true, is_anchor: true, sort_order: 1 },
  ]);
  if (eInputs) {
    // rollback compensatório: não deixar receita órfã sem âncora
    await supabase.from("recipes").delete().eq("id", id);
    throw new Error(`Falha ao criar os campos padrão da receita: ${eInputs.message}`);
  }

  revalidatePath("/receitas");
  return id;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Suíte**

Run: `npx vitest run`
Expected: PASS (nenhum teste depende desta action).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/receitas/actions.ts"
git commit -m "feat: receita nova nasce com nome interno e data-ancora"
```

---

### Task 3: Editor — rótulo derivado, layout do slot e código automático

**Files:**
- Modify: `app/(app)/receitas/[id]/_components/recipe-editor.tsx`

**Interfaces:**
- Consumes: `formatOffsetLabel`, `codeFromRole`, `nextSlotDefaults` de `@/lib/recipe-slots` (Task 1).

- [ ] **Step 1: Importar os helpers**

Em `app/(app)/receitas/[id]/_components/recipe-editor.tsx`, adicionar após o import de `saveRecipeAction`:

```ts
import { formatOffsetLabel, codeFromRole, nextSlotDefaults } from "@/lib/recipe-slots";
```

- [ ] **Step 2: Normalizar `offset_label` e `code` no save**

Substituir a função `save()` inteira por:

```tsx
  function save() {
    // O rótulo é sempre derivado (nunca digitado) e o código cai no slug do papel
    // quando a pessoa não escreve um próprio.
    const normalized = slots.map((s) => ({
      ...s,
      offset_label: formatOffsetLabel(s.offset_days, s.offset_time),
      code: s.code.trim() || codeFromRole(s.role),
    }));
    startTransition(async () => {
      await saveRecipeAction(recipe.id, { name, description, active, inputs, slots: normalized });
      router.refresh();
    });
  }
```

- [ ] **Step 3: Reescrever o card do slot (cabeçalho + duas linhas)**

Substituir todo o bloco `{trackSlots.map(...)}` — do `{trackSlots.map(({ s, idx }) => (` até o `))}` que o fecha — por:

```tsx
          {trackSlots.map(({ s, idx }, i) => (
            <div key={idx} className="rounded-xl border border-line bg-white p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-xs text-muted">#{i + 1}</span>
                  <span className="rounded-full bg-emerald/10 text-emeraldd font-mono text-xs px-2.5 py-1">{formatOffsetLabel(s.offset_days, s.offset_time)}</span>
                </div>
                <button onClick={() => setSlots((p) => p.filter((_, j) => j !== idx))} className="text-xs text-muted hover:text-risk">remover</button>
              </div>

              <div className="grid grid-cols-12 gap-3 items-end">
                <label className="col-span-7"><span className="text-[10px] font-mono uppercase text-muted">Papel / objetivo</span>
                  <input value={s.role} onChange={(e) => patchSlot(idx, { role: e.target.value })} placeholder="ex.: Convite — reserve sua vaga" className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                <label className="col-span-2"><span className="text-[10px] font-mono uppercase text-muted">Dias</span>
                  <input type="number" value={s.offset_days} onChange={(e) => patchSlot(idx, { offset_days: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                <label className="col-span-3"><span className="text-[10px] font-mono uppercase text-muted">Hora</span>
                  <input type="time" value={s.offset_time} onChange={(e) => patchSlot(idx, { offset_time: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" /></label>
              </div>

              <div className="grid grid-cols-12 gap-3 items-end mt-3">
                <label className="col-span-6"><span className="text-[10px] font-mono uppercase text-muted">Mídia sugerida</span>
                  <input value={s.suggested_media} onChange={(e) => patchSlot(idx, { suggested_media: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                {track === "api" ? (
                  <label className="col-span-3"><span className="text-[10px] font-mono uppercase text-muted">Categoria Meta</span>
                    <select value={s.meta_category ?? "UTILITY"} onChange={(e) => patchSlot(idx, { meta_category: e.target.value as "UTILITY" | "MARKETING" })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm">
                      <option value="UTILITY">UTILITY</option>
                      <option value="MARKETING">MARKETING</option>
                    </select></label>
                ) : (
                  <label className="col-span-3"><span className="text-[10px] font-mono uppercase text-muted">Comunidades</span>
                    <input value={s.target_communities ?? ""} onChange={(e) => patchSlot(idx, { target_communities: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                )}
                <label className="col-span-3"><span className="text-[10px] font-mono uppercase text-muted">Código</span>
                  <input value={s.code} onChange={(e) => patchSlot(idx, { code: e.target.value })} placeholder={codeFromRole(s.role) || "auto"} className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" /></label>
              </div>
            </div>
          ))}
```

Observações: o campo de texto "Offset" **deixa de existir**; o `remover` foi para o cabeçalho e usa `j` no filtro (o `i` agora é o índice dentro da trilha, usado no `#N`).

- [ ] **Step 4: Slot novo herda o tempo do último da trilha**

Substituir o `<button>` de "+ Adicionar slot" (o que faz `setSlots((p) => [...p, ...])`) por:

```tsx
          <button
            onClick={() =>
              setSlots((p) => {
                const lastOfTrack = [...p].reverse().find((x) => x.track === track);
                const when = nextSlotDefaults(lastOfTrack);
                return [
                  ...p,
                  track === "api"
                    ? { track: "api" as const, offset_label: formatOffsetLabel(when.offset_days, when.offset_time), code: "", role: "Novo toque", meta_category: "UTILITY" as const, target_communities: null, suggested_media: "", ...when }
                    : { track: "grupos" as const, offset_label: formatOffsetLabel(when.offset_days, when.offset_time), code: "", role: "Novo post", meta_category: null, target_communities: "1, 2, 3", suggested_media: "", ...when },
                ];
              })
            }
            className="rounded-lg border border-dashed border-line w-full py-3 text-sm text-muted hover:text-ink2 transition">
            + Adicionar slot {track === "api" ? "de API" : "de grupo"}
          </button>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Suíte**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Verificação manual (visual)**

Subir o app (`npm run dev`) e conferir:
- **Receita nova** (`/receitas` → nova) já vem com **Nome interno** e **Data e hora do evento** marcado como âncora.
- No editor, o slot mostra o **chip do rótulo** (`D-1 · 14h`) e **não existe mais** o campo "Offset" digitável; mudar Dias/Hora atualiza o chip na hora.
- **Hora** abre o seletor nativo de horário.
- **Código** vazio mostra o slug do papel como placeholder; salvar grava esse slug.
- Adicionar um segundo slot: ele **herda dia e hora** do anterior.
- Abrir a **"Promo via API"**: os slots divergentes agora exibem `D0` (a verdade); ajustar os dias e salvar corrige o registro.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/receitas/[id]/_components/recipe-editor.tsx"
git commit -m "feat: editor de receita com rotulo derivado, card legivel e codigo automatico"
```

---

## Self-Review

**Spec coverage:**
- ① Rótulo derivado (campo Offset removido, `type="time"`, chip, gravado no save) → Task 1 (`formatOffsetLabel`) + Task 3 (Steps 2, 3). ✔
- ② Receita nova com os inputs padrão + rollback → Task 2. ✔
- ③ Layout do slot em duas linhas com cabeçalho `#N` → Task 3, Step 3. ✔
- ④ Código derivado (placeholder + fallback no save) → Task 1 (`codeFromRole`) + Task 3 (Steps 2, 3). ✔
- ⑥ Slot novo com padrão inteligente → Task 1 (`nextSlotDefaults`) + Task 3, Step 4. ✔
- Sem migration / sem tocar no envio → Global Constraints, respeitado. ✔

**Placeholder scan:** todo step tem código/comando real e output esperado. Sem TBD/TODO. (O termo "placeholder" aparece apenas como o atributo HTML `placeholder=`, intencional.)

**Type consistency:** `formatOffsetLabel(days: number, time: string): string`, `codeFromRole(role: string): string` e `nextSlotDefaults(last | undefined): { offset_days: number; offset_time: string }` são definidos na Task 1 e consumidos na Task 3 com esses tipos. O objeto do slot novo (Task 3, Step 4) mantém o shape de `SaveSlot` (`track`, `offset_label`, `code`, `role`, `meta_category`, `target_communities`, `suggested_media`, `offset_days`, `offset_time`) — os dois últimos vindos do spread `...when`, com `as const` em `track`/`meta_category` para casar com a união de `SaveSlot`.
