# Hora relativa ao evento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hora de um slot de receita pode ser um deslocamento a partir da hora do evento ("1h antes", "13min depois"), em vez de só um horário fixo de relógio.

**Architecture:** Uma coluna `offset_minutes` guarda o deslocamento em minutos (negativo = antes), aplicado por `computeSendAt` quando `offset_time` está vazio. Um único `<select>` no editor escolhe modo e sinal; horas/minutos são sempre positivos. O rótulo derivado passa a ler o deslocamento em português.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind + Supabase (plpgsql RPC) + Vitest. PT-BR.

## Global Constraints

- **Retrocompatível:** `offset_minutes` default `0`; com `0` o resultado de `computeSendAt` é idêntico ao de hoje nos dois modos. Nenhum slot existente muda de comportamento.
- **`offset_minutes` só vale quando `offset_time` está vazio** (modo relativo). Com hora fixa, `offset_time` manda.
- **Sem tocar no envio, na fila, no worker nem no prompt da IA.** As peças continuam guardando `send_at` absoluto.
- **`computeSendAt` ganha o 4º parâmetro COM DEFAULT `0`** — as chamadas do refino seguem com 3 argumentos.
- **Node vem do nvm:** se `node`/`npx` não existirem, rode antes `export NVM_DIR="$HOME/.nvm"; \. "$NVM_DIR/nvm.sh"`.

---

### Task 1: Migration 0023 — coluna + `save_recipe` recriada

**Files:**
- Create: `supabase/migrations/0023_offset_minutes.sql`

**Interfaces:**
- Produces: coluna `recipe_slots.offset_minutes int not null default 0` e a função `save_recipe` aceitando `offset_minutes` no jsonb dos slots.

> **Nota de execução (controlador):** aplicar esta migration ao Supabase via MCP `apply_migration` após a task. Não é passo do subagente.

- [ ] **Step 1: Criar a migration**

Criar `supabase/migrations/0023_offset_minutes.sql`:

```sql
-- Deslocamento relativo à HORA do evento, em minutos (negativo = antes).
-- Só se aplica quando offset_time está vazio (modo relativo); com hora fixa o
-- offset_time manda e este campo é ignorado. Default 0 = "na hora do evento",
-- que é exatamente o comportamento atual — nenhum slot existente muda.
alter table public.recipe_slots
  add column if not exists offset_minutes int not null default 0;

-- save_recipe lista as colunas dos slots uma a uma; offset_minutes precisa entrar
-- nos TRÊS pontos: colunas do insert, lista do select e o jsonb_to_recordset
-- (mais o alias do with ordinality). Se divergirem, salvar receita quebra.
create or replace function public.save_recipe(
  p_id uuid,
  p_name text,
  p_description text,
  p_active boolean,
  p_inputs jsonb,
  p_slots jsonb
) returns void
language plpgsql
as $$
begin
  update public.recipes
     set name = p_name, description = p_description, active = p_active, updated_at = now()
   where id = p_id;

  delete from public.recipe_inputs where recipe_id = p_id;
  delete from public.recipe_slots  where recipe_id = p_id;

  insert into public.recipe_inputs (recipe_id, label, field_type, required, is_anchor, sort_order)
  select p_id, x.label, coalesce(x.field_type, 'texto'),
         coalesce(x.required, true), coalesce(x.is_anchor, false), (x.ord - 1)::int
  from rows from (
    jsonb_to_recordset(coalesce(p_inputs, '[]'::jsonb))
      as (label text, field_type text, required boolean, is_anchor boolean)
  ) with ordinality as x(label, field_type, required, is_anchor, ord);

  insert into public.recipe_slots
    (recipe_id, track, code, offset_label, role, meta_category, target_communities,
     suggested_media, offset_days, offset_time, offset_minutes, sort_order)
  select p_id, s.track, coalesce(s.code, ''), coalesce(s.offset_label, ''), coalesce(s.role, ''),
         s.meta_category, s.target_communities, coalesce(s.suggested_media, ''),
         coalesce(s.offset_days, 0), coalesce(s.offset_time, ''),
         coalesce(s.offset_minutes, 0), (s.ord - 1)::int
  from rows from (
    jsonb_to_recordset(coalesce(p_slots, '[]'::jsonb))
      as (track text, code text, offset_label text, role text, meta_category text,
          target_communities text, suggested_media text, offset_days int, offset_time text,
          offset_minutes int)
  ) with ordinality as s(track, code, offset_label, role, meta_category,
                         target_communities, suggested_media, offset_days, offset_time,
                         offset_minutes, ord);
end;
$$;

grant execute on function public.save_recipe(uuid, text, text, boolean, jsonb, jsonb) to authenticated;
```

- [ ] **Step 2: Conferir a suíte (nada de TS mudou ainda)**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0023_offset_minutes.sql
git commit -m "feat: coluna offset_minutes e save_recipe atualizada"
```

---

### Task 2: `computeSendAt` aceita o deslocamento

**Files:**
- Modify: `lib/schedule.ts`
- Test: `lib/schedule.test.ts`

**Interfaces:**
- Produces: `computeSendAt(anchor: string, offsetDays: number, offsetTime: string, offsetMinutes?: number): string`

- [ ] **Step 1: Escrever os testes que falham**

Em `lib/schedule.test.ts`, dentro do `describe("computeSendAt", …)`, adicionar após o teste `"âncora inválida retorna vazio"`:

```ts
  it("desloca a partir da hora do evento (antes)", () => {
    expect(computeSendAt("2026-06-27T19:07", 0, "", -60)).toBe("2026-06-27 18:07");
  });
  it("desloca a partir da hora do evento (depois)", () => {
    expect(computeSendAt("2026-06-27T19:07", 0, "", 13)).toBe("2026-06-27 19:20");
  });
  it("deslocamento rola o dia para trás", () => {
    expect(computeSendAt("2026-06-27T00:30", 0, "", -60)).toBe("2026-06-26 23:30");
  });
  it("deslocamento rola o dia para frente", () => {
    expect(computeSendAt("2026-06-27T23:30", 0, "", 60)).toBe("2026-06-28 00:30");
  });
  it("dias e deslocamento se somam", () => {
    expect(computeSendAt("2026-06-27T19:07", -1, "", -60)).toBe("2026-06-26 18:07");
  });
  it("hora fixa ignora o deslocamento", () => {
    expect(computeSendAt("2026-06-27T19:07", 0, "14:00", -60)).toBe("2026-06-27 14:00");
  });
```

(Os três testes que já existem provam a retrocompatibilidade: com o default `0`, o
resultado não muda.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/schedule.test.ts`
Expected: FAIL — os novos casos retornam a hora da âncora sem deslocamento (ex.: recebe `"2026-06-27 19:07"` onde esperava `"2026-06-27 18:07"`).

- [ ] **Step 3: Implementar**

Em `lib/schedule.ts`, substituir a função `computeSendAt` inteira por:

```ts
export function computeSendAt(
  anchor: string,
  offsetDays: number,
  offsetTime: string,
  offsetMinutes = 0,
): string {
  if (!anchor) return "";
  const d = new Date(anchor);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + offsetDays);
  if (offsetTime && /^\d{1,2}:\d{2}$/.test(offsetTime)) {
    // Hora fixa de relógio: manda, e o deslocamento é ignorado.
    const [h, m] = offsetTime.split(":").map(Number);
    d.setHours(h, m, 0, 0);
  } else if (offsetMinutes) {
    // Relativo: desloca a partir da hora do EVENTO. setMinutes rola dia/mês sozinho.
    d.setMinutes(d.getMinutes() + offsetMinutes);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/schedule.test.ts`
Expected: PASS — inclusive os três testes antigos (retrocompatibilidade).

- [ ] **Step 5: Suíte + typecheck**

Run: `npx vitest run` → PASS
Run: `npx tsc --noEmit` → sem erros (o parâmetro tem default, então nenhuma chamada quebra)

- [ ] **Step 6: Commit**

```bash
git add lib/schedule.ts lib/schedule.test.ts
git commit -m "feat: computeSendAt aceita deslocamento relativo a hora do evento"
```

---

### Task 3: Rótulo relativo e helpers de horas/minutos

**Files:**
- Modify: `lib/recipe-slots.ts`
- Test: `lib/recipe-slots.test.ts`

**Interfaces:**
- Produces:
  - `formatOffsetLabel(days: number, time: string, offsetMinutes?: number): string`
  - `splitOffsetMinutes(total: number): { sign: "antes" | "depois"; hours: number; minutes: number }`
  - `joinOffsetMinutes(sign: "antes" | "depois", hours: number, minutes: number): number`
  - `nextSlotDefaults(last: { offset_days: number; offset_time: string; offset_minutes: number } | undefined): { offset_days: number; offset_time: string; offset_minutes: number }`

- [ ] **Step 1: Atualizar e ampliar os testes**

Em `lib/recipe-slots.test.ts`:

**(a)** Trocar o import da primeira linha por:

```ts
import { formatOffsetLabel, codeFromRole, nextSlotDefaults, padTime, splitOffsetMinutes, joinOffsetMinutes } from "@/lib/recipe-slots";
```

**(b)** No `describe("formatOffsetLabel", …)`, os três casos de hora vazia mudam de
resultado (hora vazia agora significa explicitamente "na hora do evento"). Substituir:

```ts
  it("dia positivo sem hora", () => expect(formatOffsetLabel(2, "")).toBe("D+2"));
  it("dia zero sem hora", () => expect(formatOffsetLabel(0, "")).toBe("D0"));
  it("hora inválida é ignorada", () => expect(formatOffsetLabel(-3, "14h")).toBe("D-3"));
```

por:

```ts
  it("dia positivo sem hora fixa lê como relativo", () => expect(formatOffsetLabel(2, "")).toBe("D+2 · na hora"));
  it("dia zero sem hora fixa lê como relativo", () => expect(formatOffsetLabel(0, "")).toBe("D0 · na hora"));
  it("hora inválida cai no relativo", () => expect(formatOffsetLabel(-3, "14h")).toBe("D-3 · na hora"));
  it("deslocamento em horas", () => expect(formatOffsetLabel(0, "", -60)).toBe("D0 · 1h antes"));
  it("deslocamento em minutos", () => expect(formatOffsetLabel(0, "", 13)).toBe("D0 · 13min depois"));
  it("deslocamento misto", () => expect(formatOffsetLabel(-1, "", -90)).toBe("D-1 · 1h30 antes"));
  it("hora fixa ignora o deslocamento", () => expect(formatOffsetLabel(0, "14:00", -60)).toBe("D0 · 14h"));
```

**(c)** No `describe("nextSlotDefaults", …)`, o caso "último sem hora" muda de sentido:
hora vazia agora é o **modo relativo**, não "sem hora". Substituir:

```ts
  it("herda dia e hora do último", () =>
    expect(nextSlotDefaults({ offset_days: -1, offset_time: "14:00" })).toEqual({ offset_days: -1, offset_time: "14:00" }));
  it("último sem hora → 10:00", () =>
    expect(nextSlotDefaults({ offset_days: 3, offset_time: "" })).toEqual({ offset_days: 3, offset_time: "10:00" }));
```

por:

```ts
  it("herda o modo de hora fixa do último", () =>
    expect(nextSlotDefaults({ offset_days: -1, offset_time: "14:00", offset_minutes: 0 })).toEqual({ offset_days: -1, offset_time: "14:00", offset_minutes: 0 }));
  it("herda o modo relativo do último (hora vazia + deslocamento)", () =>
    expect(nextSlotDefaults({ offset_days: 3, offset_time: "", offset_minutes: -60 })).toEqual({ offset_days: 3, offset_time: "", offset_minutes: -60 }));
```

E o caso do primeiro slot:

```ts
  it("sem último slot → dia 0 às 10:00", () =>
    expect(nextSlotDefaults(undefined)).toEqual({ offset_days: 0, offset_time: "10:00" }));
```

vira:

```ts
  it("sem último slot → dia 0 às 10:00 fixas", () =>
    expect(nextSlotDefaults(undefined)).toEqual({ offset_days: 0, offset_time: "10:00", offset_minutes: 0 }));
```

**(d)** Adicionar, ao fim do arquivo, os testes dos dois helpers novos:

```ts
describe("splitOffsetMinutes", () => {
  it("zero vira antes 0h0min", () =>
    expect(splitOffsetMinutes(0)).toEqual({ sign: "antes", hours: 0, minutes: 0 }));
  it("negativo vira antes", () =>
    expect(splitOffsetMinutes(-90)).toEqual({ sign: "antes", hours: 1, minutes: 30 }));
  it("positivo vira depois", () =>
    expect(splitOffsetMinutes(13)).toEqual({ sign: "depois", hours: 0, minutes: 13 }));
});

describe("joinOffsetMinutes", () => {
  it("antes é negativo", () => expect(joinOffsetMinutes("antes", 1, 30)).toBe(-90));
  it("depois é positivo", () => expect(joinOffsetMinutes("depois", 0, 13)).toBe(13));
  it("zero continua zero", () => expect(joinOffsetMinutes("antes", 0, 0)).toBe(0));
  it("ida e volta preserva", () => {
    const s = splitOffsetMinutes(-90);
    expect(joinOffsetMinutes(s.sign, s.hours, s.minutes)).toBe(-90);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run lib/recipe-slots.test.ts`
Expected: FAIL — `splitOffsetMinutes`/`joinOffsetMinutes` não existem e os rótulos relativos ainda não são gerados.

- [ ] **Step 3: Implementar**

Em `lib/recipe-slots.ts`, substituir a função `formatOffsetLabel` por (inserindo o helper interno logo acima dela):

```ts
/** Lê o deslocamento em português: "na hora", "13min depois", "1h antes", "1h30 antes". */
function relativeReading(total: number): string {
  if (total === 0) return "na hora";
  const abs = Math.abs(total);
  const dir = total < 0 ? "antes" : "depois";
  const h = Math.floor(abs / 60);
  const mm = abs % 60;
  if (h === 0) return `${mm}min ${dir}`;
  if (mm === 0) return `${h}h ${dir}`;
  return `${h}h${String(mm).padStart(2, "0")} ${dir}`;
}

/**
 * Rótulo humano do offset, DERIVADO dos campos que de fato agendam.
 * Com hora fixa lê o relógio; sem ela, lê o deslocamento a partir da hora do evento.
 */
export function formatOffsetLabel(days: number, time: string, offsetMinutes = 0): string {
  const dia = days === 0 ? "D0" : days < 0 ? `D${days}` : `D+${days}`;
  const m = time.match(TIME_RE);
  if (m) {
    const hh = m[1].padStart(2, "0");
    const mm = m[2];
    return mm === "00" ? `${dia} · ${hh}h` : `${dia} · ${hh}h${mm}`;
  }
  return `${dia} · ${relativeReading(offsetMinutes)}`;
}
```

E substituir `nextSlotDefaults` por:

```ts
/**
 * "Quando" sugerido para um slot novo: herda o do último slot da mesma trilha —
 * inclusive o MODO (hora fixa vs relativo). O primeiro slot da trilha nasce às 10:00 fixas.
 */
export function nextSlotDefaults(
  last: { offset_days: number; offset_time: string; offset_minutes: number } | undefined,
): { offset_days: number; offset_time: string; offset_minutes: number } {
  if (!last) return { offset_days: 0, offset_time: "10:00", offset_minutes: 0 };
  return {
    offset_days: last.offset_days,
    offset_time: last.offset_time,
    offset_minutes: last.offset_minutes,
  };
}
```

E acrescentar, ao fim do arquivo, os dois helpers novos:

```ts
/** Quebra o deslocamento em sinal + horas + minutos, para os campos da UI. */
export function splitOffsetMinutes(
  total: number,
): { sign: "antes" | "depois"; hours: number; minutes: number } {
  const abs = Math.abs(total);
  return { sign: total > 0 ? "depois" : "antes", hours: Math.floor(abs / 60), minutes: abs % 60 };
}

/** Junta sinal + horas + minutos no deslocamento em minutos (negativo = antes). */
export function joinOffsetMinutes(
  sign: "antes" | "depois",
  hours: number,
  minutes: number,
): number {
  const abs = Math.abs(hours) * 60 + Math.abs(minutes);
  return sign === "antes" ? -abs : abs;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run lib/recipe-slots.test.ts`
Expected: PASS.

- [ ] **Step 5: Suíte**

Run: `npx vitest run`
Expected: PASS. (`tsc` ainda pode acusar o `recipe-editor.tsx` chamando `nextSlotDefaults` com o shape antigo — isso é resolvido na Task 5; **não** rode `tsc` como gate aqui.)

- [ ] **Step 6: Commit**

```bash
git add lib/recipe-slots.ts lib/recipe-slots.test.ts
git commit -m "feat: rotulo relativo e helpers de horas/minutos do slot"
```

---

### Task 4: Tipos, fixtures e as chamadas de geração/duplicação

**Files:**
- Modify: `lib/db/types.ts` (`RecipeSlot`)
- Modify: `app/(app)/receitas/actions.ts` (`SaveSlot`)
- Modify: `lib/recipes/slots.test.ts` (factory de fixture)
- Modify: `lib/ai/prompt.test.ts` (dois slots inline)
- Modify: `app/(app)/campanhas/actions.ts` (4 chamadas)

**Interfaces:**
- Consumes: `computeSendAt(..., offsetMinutes?)` (Task 2).
- Produces: `RecipeSlot.offset_minutes: number` e `SaveSlot.offset_minutes: number`.

- [ ] **Step 1: Campo no tipo `RecipeSlot`**

Em `lib/db/types.ts`, no `type RecipeSlot`, adicionar após `offset_time: string;`:

```ts
  offset_minutes: number;
```

- [ ] **Step 2: Campo no tipo `SaveSlot`**

Em `app/(app)/receitas/actions.ts`, no `type SaveSlot`, adicionar após `offset_time: string;`:

```ts
  offset_minutes: number;
```

- [ ] **Step 3: Consertar a fixture de `lib/recipes/slots.test.ts`**

Naquele arquivo, a função `slot()` monta um `RecipeSlot` completo. Na linha que começa com
`id: "s", recipe_id: "r", track: "api", code: "", offset_days: 0, offset_time: "",`,
acrescentar `offset_minutes: 0,` logo após `offset_time: "",`:

```ts
    id: "s", recipe_id: "r", track: "api", code: "", offset_days: 0, offset_time: "", offset_minutes: 0, offset_label: "0", role: "x",
```

- [ ] **Step 4: Consertar as fixtures de `lib/ai/prompt.test.ts`**

Nos **dois** objetos de slot (`s1` e `s2`), acrescentar `offset_minutes: 0,` logo após
`offset_time: "",`. As linhas passam a ser:

```ts
    { id: "s1", recipe_id: "r", track: "api", code: "webinario_convite_2706", offset_days: 0, offset_time: "", offset_minutes: 0, offset_label: "-3 dias", role: "Convite ao webinário", meta_category: "UTILITY", target_communities: null, suggested_media: "Vídeo Lucas", sort_order: 0 },
    { id: "s2", recipe_id: "r", track: "grupos", code: "webinario_convite_2706", offset_days: 0, offset_time: "", offset_minutes: 0, offset_label: "-3 dias", role: "Convite", meta_category: null, target_communities: "1, 2, 3", suggested_media: "Vídeo convite", sort_order: 0 },
```

- [ ] **Step 5: Passar o deslocamento na geração e na duplicação**

Em `app/(app)/campanhas/actions.ts`, nas **4** chamadas que partem de slots de receita,
acrescentar o quarto argumento. Substituir cada linha conforme abaixo (as duas primeiras
são da geração, as duas últimas da duplicação):

```ts
          send_at: computeSendAt(anchorValue, apiSlots[idx]?.offset_days ?? 0, apiSlots[idx]?.offset_time ?? ""),
```
→
```ts
          send_at: computeSendAt(anchorValue, apiSlots[idx]?.offset_days ?? 0, apiSlots[idx]?.offset_time ?? "", apiSlots[idx]?.offset_minutes ?? 0),
```

```ts
          send_at: computeSendAt(anchorValue, gruposSlots[idx]?.offset_days ?? 0, gruposSlots[idx]?.offset_time ?? ""),
```
→
```ts
          send_at: computeSendAt(anchorValue, gruposSlots[idx]?.offset_days ?? 0, gruposSlots[idx]?.offset_time ?? "", gruposSlots[idx]?.offset_minutes ?? 0),
```

```ts
        send_at: recipe ? computeSendAt(anchorValue, apiSlots[idx]?.offset_days ?? 0, apiSlots[idx]?.offset_time ?? "") : t.send_at,
```
→
```ts
        send_at: recipe ? computeSendAt(anchorValue, apiSlots[idx]?.offset_days ?? 0, apiSlots[idx]?.offset_time ?? "", apiSlots[idx]?.offset_minutes ?? 0) : t.send_at,
```

```ts
        send_at: recipe ? computeSendAt(anchorValue, gruposSlots[idx]?.offset_days ?? 0, gruposSlots[idx]?.offset_time ?? "") : p.send_at,
```
→
```ts
        send_at: recipe ? computeSendAt(anchorValue, gruposSlots[idx]?.offset_days ?? 0, gruposSlots[idx]?.offset_time ?? "", gruposSlots[idx]?.offset_minutes ?? 0) : p.send_at,
```

As **duas** chamadas do refino (peças novas vindas da IA) ficam com 3 argumentos —
**não** mexer nelas.

- [ ] **Step 6: Suíte**

Run: `npx vitest run`
Expected: PASS (as fixtures corrigidas compilam e passam).

- [ ] **Step 7: Commit**

```bash
git add lib/db/types.ts "app/(app)/receitas/actions.ts" lib/recipes/slots.test.ts lib/ai/prompt.test.ts "app/(app)/campanhas/actions.ts"
git commit -m "feat: offset_minutes nos tipos, fixtures e na geracao/duplicacao"
```

---

### Task 5: Editor — card em 3 linhas com o seletor de modo

**Files:**
- Modify: `app/(app)/receitas/[id]/_components/recipe-editor.tsx`

**Interfaces:**
- Consumes: `formatOffsetLabel(days, time, offsetMinutes)`, `splitOffsetMinutes`, `joinOffsetMinutes`, `nextSlotDefaults` (Task 3); `SaveSlot.offset_minutes` (Task 4).

- [ ] **Step 1: Importar os helpers novos**

Substituir a linha de import de `@/lib/recipe-slots` por:

```ts
import { formatOffsetLabel, codeFromRole, nextSlotDefaults, padTime, splitOffsetMinutes, joinOffsetMinutes } from "@/lib/recipe-slots";
```

- [ ] **Step 2: Hidratar `offset_minutes`**

No `useState<SaveSlot[]>` inicial, na linha que hoje é:

```ts
      offset_days: s.offset_days, offset_time: padTime(s.offset_time),
```

passar a ser:

```ts
      offset_days: s.offset_days, offset_time: padTime(s.offset_time), offset_minutes: s.offset_minutes,
```

- [ ] **Step 3: Passar o deslocamento ao derivar o rótulo (save e chip "era:")**

Em `save()`, na construção de `normalized`, trocar:

```ts
      offset_label: formatOffsetLabel(s.offset_days, s.offset_time),
```

por:

```ts
      offset_label: formatOffsetLabel(s.offset_days, s.offset_time, s.offset_minutes),
```

E, na contagem `achatados`, trocar:

```ts
      (s) => s.offset_label && s.offset_label !== formatOffsetLabel(s.offset_days, s.offset_time),
```

por:

```ts
      (s) => s.offset_label && s.offset_label !== formatOffsetLabel(s.offset_days, s.offset_time, s.offset_minutes),
```

- [ ] **Step 4: Reescrever o corpo do card (cabeçalho + 3 linhas)**

Substituir todo o bloco `{trackSlots.map(({ s, idx }, i) => ( … ))}` por:

```tsx
          {trackSlots.map(({ s, idx }, i) => {
            const derived = formatOffsetLabel(s.offset_days, s.offset_time, s.offset_minutes);
            const mode: "fixa" | "antes" | "depois" = s.offset_time
              ? "fixa"
              : s.offset_minutes > 0
                ? "depois"
                : "antes";
            const rel = splitOffsetMinutes(s.offset_minutes);
            const sign: "antes" | "depois" = mode === "depois" ? "depois" : "antes";
            return (
            <div key={idx} className="rounded-xl border border-line bg-white p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-xs text-muted">#{i + 1}</span>
                  <span className="rounded-full bg-emerald/10 text-emeraldd font-mono text-xs px-2.5 py-1">{derived}</span>
                  {s.offset_label && s.offset_label !== derived && (
                    <span
                      className="font-mono text-xs text-risk"
                      title="Rótulo antigo, escrito à mão, que não bate com o Quando — quem agenda são estes campos. Ajuste-os; ao salvar, este rótulo é substituído."
                    >
                      era: {s.offset_label}
                    </span>
                  )}
                </div>
                <button onClick={() => setSlots((p) => p.filter((_, j) => j !== idx))} className="text-xs text-muted hover:text-risk">remover</button>
              </div>

              <div className="grid grid-cols-12 gap-3 items-end">
                <label className="col-span-12"><span className="text-[10px] font-mono uppercase text-muted">Papel / objetivo</span>
                  <input value={s.role} onChange={(e) => patchSlot(idx, { role: e.target.value })} placeholder="ex.: Convite — reserve sua vaga" className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
              </div>

              <div className="grid grid-cols-12 gap-3 items-end mt-3">
                <label className="col-span-3"><span className="text-[10px] font-mono uppercase text-muted">Dias</span>
                  <input type="number" value={s.offset_days} onChange={(e) => patchSlot(idx, { offset_days: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                <label className="col-span-4"><span className="text-[10px] font-mono uppercase text-muted">Quando</span>
                  <select
                    value={mode}
                    onChange={(e) => {
                      const v = e.target.value as "fixa" | "antes" | "depois";
                      if (v === "fixa") patchSlot(idx, { offset_time: s.offset_time || "10:00" });
                      else patchSlot(idx, { offset_time: "", offset_minutes: joinOffsetMinutes(v, rel.hours, rel.minutes) });
                    }}
                    className="mt-1 w-full rounded-lg border border-line p-2 text-sm"
                  >
                    <option value="fixa">hora fixa</option>
                    <option value="antes">antes do evento</option>
                    <option value="depois">depois do evento</option>
                  </select></label>
                <div className="col-span-5 flex gap-3 items-end">
                  {mode === "fixa" ? (
                    <label className="flex-1"><span className="text-[10px] font-mono uppercase text-muted">Hora</span>
                      <input type="time" value={s.offset_time} onChange={(e) => patchSlot(idx, { offset_time: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" /></label>
                  ) : (
                    <>
                      <label className="flex-1"><span className="text-[10px] font-mono uppercase text-muted">Horas</span>
                        <input type="number" min={0} value={rel.hours} onChange={(e) => patchSlot(idx, { offset_minutes: joinOffsetMinutes(sign, Number(e.target.value), rel.minutes) })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                      <label className="flex-1"><span className="text-[10px] font-mono uppercase text-muted">Minutos</span>
                        <input type="number" min={0} value={rel.minutes} onChange={(e) => patchSlot(idx, { offset_minutes: joinOffsetMinutes(sign, rel.hours, Number(e.target.value)) })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-12 gap-3 items-end mt-3">
                <label className={track === "api" ? "col-span-6" : "col-span-9"}><span className="text-[10px] font-mono uppercase text-muted">Mídia sugerida</span>
                  <input value={s.suggested_media} onChange={(e) => patchSlot(idx, { suggested_media: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                {track === "api" && (
                  <label className="col-span-3"><span className="text-[10px] font-mono uppercase text-muted">Categoria Meta</span>
                    <select value={s.meta_category ?? "UTILITY"} onChange={(e) => patchSlot(idx, { meta_category: e.target.value as "UTILITY" | "MARKETING" })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm">
                      <option value="UTILITY">UTILITY</option>
                      <option value="MARKETING">MARKETING</option>
                    </select></label>
                )}
                <label className="col-span-3"><span className="text-[10px] font-mono uppercase text-muted">Código</span>
                  <input value={s.code} onChange={(e) => patchSlot(idx, { code: e.target.value })} placeholder={codeFromRole(s.role) || "auto"} className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" /></label>
              </div>
            </div>
            );
          })}
```

- [ ] **Step 5: Slot novo carrega o `offset_minutes`**

No `onClick` do botão "+ Adicionar slot", o `...when` já traz o campo novo (Task 3), mas
o `offset_label` derivado precisa do terceiro argumento. Nos **dois** ramos, trocar:

```tsx
offset_label: formatOffsetLabel(when.offset_days, when.offset_time),
```

por:

```tsx
offset_label: formatOffsetLabel(when.offset_days, when.offset_time, when.offset_minutes),
```

- [ ] **Step 6: Typecheck + suíte**

Run: `npx tsc --noEmit` → sem erros
Run: `npx vitest run` → PASS

- [ ] **Step 7: Verificação manual (visual)**

Precisa da migration `0023` aplicada. Subir o app (`npm run dev`) e conferir:
- Num slot, escolher **antes do evento** + `1`h `0`min → o chip vira `D0 · 1h antes`.
- Trocar para **depois do evento** + `0`h `13`min → chip `D0 · 13min depois`.
- Trocar para **hora fixa** → volta o seletor de horário; chip volta a `D0 · 10h`.
- **Salvar** e reabrir: o modo e os valores persistem.
- Gerar uma campanha e conferir que a peça caiu 1h antes da âncora; mudar a âncora,
  duplicar a campanha, e conferir que a peça **acompanhou** o novo horário.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/receitas/[id]/_components/recipe-editor.tsx"
git commit -m "feat: editor com hora relativa ao evento (seletor de modo)"
```

---

## Self-Review

**Spec coverage:**
- ① Migration: coluna + `save_recipe` recriada nos três pontos → Task 1. ✔
- ② `computeSendAt` com 4º parâmetro e virada de dia → Task 2. ✔
- ③ Rótulo relativo + `splitOffsetMinutes`/`joinOffsetMinutes` + `nextSlotDefaults` herdando o modo → Task 3. ✔
- ④ Tipos `RecipeSlot`/`SaveSlot` + fixtures → Task 4, Steps 1-4. ✔
- ⑤ Editor em 3 linhas com o select de modo → Task 5. ✔
- ⑥ 4 chamadas de geração/duplicação passam o valor; as 2 do refino não → Task 4, Step 5. ✔

**Placeholder scan:** todo step tem código/comando real e output esperado. Sem TBD/TODO. A Task 3 declara explicitamente que `tsc` **não** é gate naquele ponto (o editor só é ajustado na Task 5) — isso é deliberado, não omissão.

**Type consistency:** `computeSendAt(anchor, offsetDays, offsetTime, offsetMinutes = 0)` (Task 2) é chamado com 4 args na Task 4 e com 3 no refino (default). `nextSlotDefaults` passa a receber/retornar `{ offset_days, offset_time, offset_minutes }` (Task 3) e é consumido na Task 5 via `...when`. `splitOffsetMinutes` retorna `{ sign, hours, minutes }` e alimenta `joinOffsetMinutes(sign, hours, minutes)` — os dois usados na Task 5. `SaveSlot` e `RecipeSlot` ganham `offset_minutes: number` (Task 4), consumido na hidratação e no `patchSlot` da Task 5.
