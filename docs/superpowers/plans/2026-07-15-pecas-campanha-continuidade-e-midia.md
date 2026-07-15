# Peças de campanha: Janela 24h contínua + mídia sob demanda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encadear a Janela 24h da trilha API ao template que a abre, esconder o anexo de mídia nas peças só-texto, e transformar a sugestão de mídia num briefing de produção em texto.

**Architecture:** Três frentes independentes: (1) uma regra de continuidade no `SYSTEM_PROMPT`, que geração e refino compartilham; (2) um gate de UI que só renderiza o `MediaPicker` quando a peça tem briefing de mídia, com o `mediaMissing` dos toques ajustado; (3) o campo `media` renderizado como bloco de briefing legível e editável em textarea. Nenhuma migration; nada no caminho de envio muda.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind + Vitest. Copy em PT-BR.

## Global Constraints

- **Sem migration.** As colunas `campaign_group_posts.media`, `recipe_slots.suggested_media` e o `media` dentro de `campaign_touches.window_steps` já são `text`/string. Nenhuma mudança de schema.
- **Sem tocar no envio.** O briefing é sugestão editorial; o disparo continua usando `payload` (texto + `asset_id`). Não alterar fila, jitter, validação nem `SendPayload`.
- **Node vem do nvm.** Comandos de terminal assumem node carregado. Se `node`/`npx` não existirem no shell, rode antes: `export NVM_DIR="$HOME/.nvm"; \. "$NVM_DIR/nvm.sh"`.
- **Copy em português do Brasil.** Todo texto de UI e de prompt em PT-BR.
- **Voz do prompt:** Lucas Arruda, 1ª pessoa, frases curtas, sem hype, anti-guru. Nunca citar "Wesley", preço ou nome de tier/plano.

---

### Task 1: `stepMediaMissing` — "Falta mídia" nos toques ignora passos só-texto

O `mediaMissing` de um toque hoje é `t.window_steps.some((s) => !s.asset_id)`, que marca "Falta mídia" até em passos que são só-texto (sem briefing de mídia). Extrair um predicado puro e corrigir a regra: só falta mídia num passo que **pede** mídia (`media` não-vazio) e não tem asset.

**Files:**
- Modify: `lib/campaign-pieces.ts` (adicionar helper; usar em `toPieces`, linha ~224)
- Test: `lib/campaign-pieces.test.ts`

**Interfaces:**
- Produces: `stepMediaMissing(steps: { media: string; asset_id?: string }[]): boolean`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao fim de `lib/campaign-pieces.test.ts`. Incluir `stepMediaMissing` no import de `@/lib/campaign-pieces` no topo do arquivo (linha 2-10):

```ts
import {
  pieceDateKey,
  pieceTime,
  formatDayHeader,
  groupByDate,
  monthMatrix,
  weekDays,
  stepMediaMissing,
  type Piece,
} from "@/lib/campaign-pieces";
```

```ts
describe("stepMediaMissing", () => {
  it("acusa falta só quando o passo pede mídia e não tem asset", () => {
    expect(stepMediaMissing([{ media: "Vídeo 20s", asset_id: undefined }])).toBe(true);
    expect(stepMediaMissing([{ media: "Vídeo 20s", asset_id: "a1" }])).toBe(false);
    expect(stepMediaMissing([{ media: "", asset_id: undefined }])).toBe(false); // passo só-texto
    expect(stepMediaMissing([])).toBe(false);
  });
  it("basta um passo com mídia faltando entre vários", () => {
    expect(
      stepMediaMissing([
        { media: "", asset_id: undefined },
        { media: "Card contagem", asset_id: undefined },
      ])
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/campaign-pieces.test.ts`
Expected: FAIL — `stepMediaMissing is not a function` (ou erro de import).

- [ ] **Step 3: Implementar o helper**

Adicionar em `lib/campaign-pieces.ts`, logo antes de `toPieces` (antes da linha `export function toPieces`, ~194):

```ts
/**
 * Um passo da Janela 24h só "falta mídia" se pede mídia (briefing não-vazio) e
 * ainda não tem asset anexado. Passo só-texto (briefing vazio) nunca acusa falta.
 */
export function stepMediaMissing(
  steps: { media: string; asset_id?: string }[]
): boolean {
  return steps.some((s) => s.media !== "" && !s.asset_id);
}
```

- [ ] **Step 4: Usar o helper em `toPieces`**

Em `lib/campaign-pieces.ts`, na montagem da peça de toque (~linha 224), trocar:

```ts
      mediaMissing: t.window_steps.some((s) => !s.asset_id),
```

por:

```ts
      mediaMissing: stepMediaMissing(t.window_steps),
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npx vitest run lib/campaign-pieces.test.ts`
Expected: PASS (todos os `describe`, incluindo os novos).

- [ ] **Step 6: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: PASS — 172+ testes verdes (os 2 novos `it` somam ao total).

- [ ] **Step 7: Commit**

```bash
git add lib/campaign-pieces.ts lib/campaign-pieces.test.ts
git commit -m "fix: 'Falta mídia' no toque ignora passos só-texto"
```

---

### Task 2: Gate do anexo — `MediaPicker` só aparece com briefing de mídia

Esconder o `MediaPicker` nas peças só-texto (campo `media` vazio), tanto no post de grupo quanto em cada passo da Janela 24h. Peça vira "com-mídia" ao ganhar um briefing — no post, pelo "Editar" (Task 3 torna o campo um textarea); no toque, pelo chat de refino (comportamento atual, mantido).

**Files:**
- Modify: `app/(app)/campanhas/[id]/_components/post-card.tsx` (~linha 70-72)
- Modify: `app/(app)/campanhas/[id]/_components/touch-card.tsx` (~linha 100)

**Interfaces:**
- Consumes: `CampaignGroupPost.media`, `window_steps[].media` (ambos `string`, já existentes).

- [ ] **Step 1: Gatear o anexo do post de grupo**

Em `post-card.tsx`, trocar o bloco (~linha 70-72):

```tsx
          <div className="mt-3">
            <MediaPicker assets={assets} currentId={post.asset_id} suggestion={post.media} onPick={(id) => setPostAssetAction(campaignId, post.sort_order, id)} />
          </div>
```

por:

```tsx
          {post.media && (
            <div className="mt-3">
              <MediaPicker assets={assets} currentId={post.asset_id} suggestion={post.media} onPick={(id) => setPostAssetAction(campaignId, post.sort_order, id)} />
            </div>
          )}
```

- [ ] **Step 2: Gatear o anexo de cada passo da Janela 24h**

Em `touch-card.tsx`, dentro do `window_steps.map` (~linha 100), trocar:

```tsx
                  <MediaPicker assets={assets} currentId={w.asset_id ?? null} suggestion={w.media} onPick={(id) => setTouchStepAssetAction(campaignId, touch.sort_order, wi, id)} />
```

por:

```tsx
                  {w.media && (
                    <MediaPicker assets={assets} currentId={w.asset_id ?? null} suggestion={w.media} onPick={(id) => setTouchStepAssetAction(campaignId, touch.sort_order, wi, id)} />
                  )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Verificação manual (visual)**

Subir o app (`npm run dev`), abrir uma campanha existente e conferir:
- Post de grupo **com** briefing de mídia → o anexo aparece.
- Post de grupo **sem** briefing (campo `media` vazio) → o anexo some.
- Passo da Janela 24h com `media` preenchido → anexo aparece; passo só-texto → sem anexo.

(Se não houver peça só-texto à mão, editar um post e limpar o campo de mídia para confirmar que o anexo some.)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/campanhas/[id]/_components/post-card.tsx" "app/(app)/campanhas/[id]/_components/touch-card.tsx"
git commit -m "feat: anexo de midia so aparece nas pecas que pedem midia"
```

---

### Task 3: Briefing de mídia legível + editável em textarea

Renderizar o briefing como um bloco legível (multilinha, visível inclusive depois de anexar, para conferir se o arquivo bate com o pedido) e transformar o campo de edição do post num `textarea`.

**Files:**
- Modify: `app/(app)/campanhas/[id]/_components/media-picker.tsx` (~linha 64-67)
- Modify: `app/(app)/campanhas/[id]/_components/post-card.tsx` (~linha 131)

**Interfaces:**
- Consumes: prop `suggestion?: string` do `MediaPicker` (já existente); `PostFields.media` (string, já existente).

- [ ] **Step 1: Bloco de briefing no `MediaPicker`**

Em `media-picker.tsx`, trocar (~linha 64-67):

```tsx
    <div className="mt-1">
      {!current && suggestion && (
        <p className="font-mono text-[11px] text-muted mb-1">Sugestão: {suggestion}</p>
      )}
```

por:

```tsx
    <div className="mt-1">
      {suggestion && (
        <div className="mb-2 rounded-lg border border-line bg-paper px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1">Briefing da mídia</p>
          <p className="text-xs leading-relaxed whitespace-pre-wrap text-ink2">{suggestion}</p>
        </div>
      )}
```

(Muda de "aparece só sem asset" para "aparece sempre que há briefing"; multilinha via `whitespace-pre-wrap`.)

- [ ] **Step 2: Textarea no modo Editar do post**

Em `post-card.tsx`, trocar a linha do campo de mídia (~linha 131):

```tsx
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Mídia sugerida</span><input value={f.media} onChange={(e) => setF({ ...f, media: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
```

por:

```tsx
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Briefing da mídia</span><textarea value={f.media} onChange={(e) => setF({ ...f, media: e.target.value })} rows={3} placeholder="Deixe vazio para peça só-texto (sem anexo)." className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Verificação manual (visual)**

No app: abrir um post com briefing → ver o bloco "Briefing da mídia" acima do anexo, inclusive depois de escolher um arquivo. Entrar em "Editar" → o campo é um textarea de 3 linhas; esvaziá-lo e salvar → o anexo some (peça vira só-texto); preenchê-lo e salvar → o anexo volta.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/campanhas/[id]/_components/media-picker.tsx" "app/(app)/campanhas/[id]/_components/post-card.tsx"
git commit -m "feat: sugestao de midia vira briefing legivel e editavel em textarea"
```

---

### Task 4: Prompt — continuidade da Janela 24h + briefing de mídia na geração

Adicionar ao `SYSTEM_PROMPT` (compartilhado por geração e refino, via `refine.ts:46`) duas regras: (①) cada passo da Janela 24h continua a thread do template do mesmo toque; (③) o campo `media` é um briefing de produção, não um rótulo. Verificação por geração real — não há teste unitário significativo para qualidade de prompt.

**Files:**
- Modify: `lib/ai/prompt.ts` (`SYSTEM_PROMPT`, ~linha 3-14)

**Interfaces:**
- Consumes/Produces: nada de novo — só o conteúdo da string `SYSTEM_PROMPT`.

- [ ] **Step 1: Adicionar as duas regras ao `SYSTEM_PROMPT`**

Em `lib/ai/prompt.ts`, dentro da lista "Regras inegociáveis", logo após a linha da Trilha API individual (a que termina em "mantém a porta aberta)."), inserir estes dois bullets:

```ts
- Janela de 24h contínua: cada passo da janela CONTINUA a conversa que o template daquele toque abriu — mesma voz e mesmo tema/promessa da mensagem inicial, retomando o que o template disse (nunca reabra a conversa do zero). Os passos progridem entre si (passo 1 prepara o 2, o 2 prepara o 3), escalando rumo ao CTA do papel do toque.
- Campo "media" (janela e posts de grupo) é um BRIEFING de produção, não um rótulo: em 1-3 frases diga formato (vídeo/card/print/áudio), duração aproximada quando fizer sentido, o que aparece ou se diz, a mensagem-chave e o tom. Expanda a "mídia sugerida" do slot num roteiro útil para quem vai produzir. Deixe "media" VAZIO quando a peça for deliberadamente só-texto.
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (mudança é só string).

- [ ] **Step 3: Suíte de testes**

Run: `npx vitest run`
Expected: PASS — nenhum teste depende do texto literal do prompt; tudo segue verde.

- [ ] **Step 4: Verificação por geração real**

Com `ANTHROPIC_API_KEY` no `.env.local`, subir o app e gerar uma campanha nova pela receita "Webinário quinzenal". Conferir:
- **①** Nos toques da trilha API, os passos da "Janela 24h" retomam o template (mesmo tema/promessa, voz do Lucas) e progridem entre si rumo ao CTA — não parecem conversas soltas.
- **③** O campo de mídia (briefing) traz formato + o que mostrar + mensagem-chave, e não um rótulo de 3 palavras. Peças pensadas como só-texto vêm com `media` vazio (e, graças à Task 2, sem anexo).

Se a copy vier fraca em algum ponto, ajustar o texto dos bullets e regenerar. (Refino de uma peça também deve preservar a continuidade, já que usa o mesmo `SYSTEM_PROMPT`.)

- [ ] **Step 5: Commit**

```bash
git add lib/ai/prompt.ts
git commit -m "feat: prompt encadeia a Janela 24h ao template e pede briefing de midia"
```

---

## Self-Review

**Spec coverage:**
- ① Janela 24h contínua (geração + refino) → Task 4 (regra no `SYSTEM_PROMPT`, compartilhado por ambos via `refine.ts:46`). ✔
- ② Anexo só onde há mídia → Task 2 (gate no post e no passo). ✔
- ② `mediaMissing` dos toques ignora passos só-texto → Task 1. ✔
- ③ Briefing em texto na geração → Task 4 (regra do campo `media`). ✔
- ③ Briefing legível na UI + textarea no Editar → Task 3. ✔
- Sem migration / sem tocar no envio → respeitado em todas as tasks (Global Constraints). ✔
- Virar só-texto → com-mídia pelo Editar → Task 3 torna o campo textarea; Task 2 revela o anexo quando `media` fica não-vazio. ✔

**Placeholder scan:** todo step tem código/comando real e output esperado. O único `placeholder` textual é o atributo HTML `placeholder=` de um textarea (intencional). Sem TBD/TODO.

**Type consistency:** `stepMediaMissing(steps: { media: string; asset_id?: string }[]): boolean` é definido na Task 1 e usado só ali; casa com o shape de `CampaignTouch.window_steps` (`{ media: string; caption: string; asset_id?: string }`). Props `suggestion?: string` e `PostFields.media` já existem e não mudam de tipo.
