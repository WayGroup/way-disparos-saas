# Desconectar o número (e trocar quem carrega os grupos)

**Data:** 2026-08-03
**Status:** aprovado, aguardando plano de implementação

## Problema

A faixa de conexão em `/disparos` tem *Conectar número*, *Sincronizar grupos* e
*Pausar tudo*. **Não tem como desconectar.** Com a sessão de pé, o botão de conexão
vira "Gerar novo QR", mas `GET /instance/connect/{instance}` não devolve QR enquanto a
instância está `open` — responde só o estado. Resultado: o caminho que parece ser o de
trocar o número não leva a lugar nenhum, e a troca só é possível saindo pelo celular
antigo (*Aparelhos conectados*), que é justamente o que costuma faltar.

Existe ainda uma falha adjacente que a troca de número torna provável: logo após parear,
a Evolution leva um tempo carregando os chats e `/chat/findChats` responde vazio ou pela
metade. `planCommunitySync` trata "grupo ausente da lista" como "grupo sumiu" e desativa.
Sincronizar cedo demais **desativa a lista inteira de grupos**. É recuperável (basta
sincronizar de novo), mas no intervalo não há destino disponível para montar campanha.

## Decisões (do brainstorming)

- **Logout, não delete.** `DELETE /instance/logout/{instance}` solta o número e preserva
  a instância (mesmo nome, mesmas configurações, mesmo webhook). Apagar e recriar a
  instância seria mais código para o mesmo efeito.
- **Desconectar liga a pausa sozinho**, com motivo `"Troca de número"`. **Retomar é
  manual** — a fila não volta a andar antes de a pessoa conferir a sincronização.
- **Ordem obrigatória: pausa primeiro, logout depois.** Se o logout falhar, o sistema
  fica pausado e conectado — seguro e reversível com um clique. Na ordem inversa, uma
  falha ao pausar deixaria a fila tentando entregar com o número fora do ar, queimando
  as 3 tentativas (`complete_scheduled_send`: 1, 3 e 9 min, depois `falhou` definitivo).
- **Sem tela nova para o retorno.** A faixa de pausa que já existe mostra o motivo, e o
  botão verde *Retomar envios* já vive no topo dela.
- **Trava do sincronizar entra junto**, com duas regras, ambas pedindo confirmação em
  vez de bloquear: lista vazia com grupos cadastrados, e desativação de mais da metade.
  Nenhuma das duas é um beco sem saída — se o número realmente saiu dos grupos,
  confirmar desativa de propósito.
- O número novo **já está nos mesmos grupos**. Como o JID de um grupo é global (o mesmo
  para todos os membros), `planCommunitySync` reencontra tudo por JID e `enabled` não é
  tocado — a configuração de quais grupos estão em uso sobrevive à troca.

## Não-objetivos

- **Sem migration.** Nenhuma coluna ou tabela nova; a pausa reusa `app_settings`.
- Sem variável de ambiente nova e **sem trocar `EVOLUTION_INSTANCE`** — a instância é a
  mesma antes e depois; o que muda é o celular que lê o QR.
- Sem apagar nem recriar instância (`DELETE /instance/delete`, `POST /instance/create`).
- Sem múltiplas instâncias/números simultâneos.
- Sem sincronizar automaticamente após reconectar — é clique consciente.
- Sem registrar histórico de qual número esteve conectado.
- **Nada é apagado do banco em nenhum caminho.** Grupo no máximo vai de `active: true`
  para `false`, e volta ao sincronizar de novo.

## Escopo

### ① Cliente Evolution — `lib/evolution/client.ts`

- `evoFetch`: `init.method` passa a aceitar `"GET" | "POST" | "DELETE"`. Nenhuma outra
  mudança — o tratamento de timeout e de `!res.ok` já serve.
- `evoLogout(cfg: EvolutionConfig): Promise<void>` → `DELETE /instance/logout/{instance}`.
  Descarta o corpo da resposta; o que importa é não ter lançado.

### ② Risco da sincronização — `lib/evolution/sync.ts`

Função **pura**, sem rede e sem banco, ao lado de `planCommunitySync`:

```ts
export type SyncRisk =
  | { kind: "ok" }
  | { kind: "empty"; total: number }
  | { kind: "mass"; deactivating: number; total: number };

export function assessSyncRisk(
  plan: SyncPlan,
  existing: SyncableCommunity[],
  groupCount: number,
): SyncRisk;
```

Regras, nesta ordem:

1. `total` = quantas comunidades têm `wa_group_id` **e** `active === true`.
2. `groupCount === 0 && total > 0` → `{ kind: "empty", total }`.
3. `plan.deactivate.length * 2 > total` → `{ kind: "mass", … }` (estritamente mais da
   metade: 6 de 10 pede confirmação, 5 de 10 não).
4. Caso contrário → `{ kind: "ok" }`.

A primeira sincronização de todas (`total === 0`, `groupCount === 0`) cai em `ok` — não
há o que proteger.

### ③ Server actions — `app/(app)/disparos/actions.ts`

**`disconnectNumberAction(): Promise<void>`**

1. `setPauseAction(true, "Troca de número")` — mesma função já usada pelo botão de pausa.
2. `evoLogout(getEvolutionConfig(process.env))`.
3. `revalidateAll()`.

Não devolve o estado pós-logout: o `router.refresh()` do chamador já faz o servidor
recalcular o estado real em `page.tsx`, e uma segunda chamada à Evolution só para isso
custaria até 20s de timeout sem comprar nada.

Se o passo 2 lançar, o erro sobe para a UI com a pausa já aplicada (estado seguro).

**`syncGroupsAction(confirmed: boolean = false)`** — o tipo de retorno vira união:

```ts
export type SyncResult =
  | { ok: true; inserted: number; linked: number; deactivated: number }
  | { ok: false; needsConfirm: true; reason: "empty" | "mass"; deactivating: number; total: number };
```

Ordem dentro da action:

1. `evoListGroups` e `select` das comunidades — como hoje.
2. `planCommunitySync` → `assessSyncRisk(plan, existing, groups.length)`.
3. `risk.kind !== "ok" && !confirmed` → `return { ok: false, needsConfirm: true, reason: risk.kind, … }`.
   `empty` e `mass` são a mesma trava (desativação em massa) e por isso usam o mesmo
   caminho de saída — confirmar e, no sim, repetir com `confirmed = true`. Não há
   `throw` sem bypass: se o número realmente saiu de todos os grupos, confirmar
   desativa a lista de propósito, em vez de travar a sincronização até alguém editar o
   banco à mão.
4. Só então as escritas (insert / update / deactivate), exatamente como hoje.

Nenhuma escrita acontece antes da avaliação de risco.

### ④ Faixa de conexão — `app/(app)/disparos/_components/connection-strip.tsx`

- **Botão "Desconectar número"**, ao lado de *Conectar número*, em cor de risco
  (`border-risk text-risk`, mesmo tratamento do *Pausar tudo*). Visível quando
  `!configError && state !== "close"` — inclusive em `"connecting"`, já que soltar a
  sessão é o conserto de uma instância travada nesse estado.
- `confirm()` antes de agir (mesmo padrão do `togglePause`), dizendo: os envios ficam
  pausados, a lista de grupos é preservada, e nada sai até reconectar e retomar.
- Ao concluir: `setQr(null)`, `setSync(null)` e `router.refresh()` (o `run` já refaz).
- **Sincronizar** passa por um `runSync(confirmed: boolean)` com transição própria — se a
  resposta vier `needsConfirm`, mostra um `confirm()` cujo texto depende do `reason`
  (`mass`: "Isso vai desativar X dos Y grupos sincronizados"; `empty`: a Evolution
  devolveu ZERO grupos, quase sempre por ainda estar carregando as conversas, e o certo
  é cancelar, esperar um minuto e sincronizar de novo) e, no sim, chama `runSync(true)`.
  Não reusa o `run`, cuja semântica de `onOk` não serve ao fluxo confirmar-e-repetir; a
  repetição confirmada abre uma segunda transição, disparada de dentro do callback da
  primeira, de modo que `pending` não tem lacuna entre as duas.
- O estado local `sync` guarda só a variante `ok: true`.

### ⑤ Testes — `lib/evolution/sync.test.ts`

`describe("assessSyncRisk")`, cobrindo: lista vazia com grupos vinculados → `empty`;
lista vazia na primeira sincronização → `ok`; 6 de 10 desativados → `mass`; 5 de 10 →
`ok`; sincronização normal sem desativação → `ok`.

O logout não ganha teste: é I/O puro sobre `evoFetch`, e o projeto não testa o client
diretamente (só `config`, `sync` e `url`).

## Componentes tocados

| Arquivo | Mudança |
|---|---|
| `lib/evolution/client.ts` | `DELETE` no `evoFetch`; `evoLogout` (①) |
| `lib/evolution/sync.ts` | `SyncRisk` + `assessSyncRisk` (②) |
| `app/(app)/disparos/actions.ts` | `disconnectNumberAction`; trava no `syncGroupsAction` (③) |
| `app/(app)/disparos/_components/connection-strip.tsx` | botão, confirmações, `runSync` (④) |
| `lib/evolution/sync.test.ts` | casos de `assessSyncRisk` (⑤) |

## Verificação

- **Typecheck** (`npx tsc --noEmit`) e **suíte** (`npx vitest run`) verdes. A união do
  `SyncResult` é a mudança de tipo que o compilador precisa cobrar na UI.
- **Manual, o caminho da troca:** com o número conectado, *Desconectar número* → a faixa
  fica vermelha com "Envios pausados · Troca de número" e o estado vai para
  *Desconectado* → *Conectar número* mostra o QR → parear com o celular novo → a tela se
  atualiza sozinha para *Conectado* → *Sincronizar grupos* devolve `0 novo(s)`,
  `0 atualizado(s)`, `0 sumiram` (os JIDs são os mesmos) e a contagem de grupos em uso
  continua idêntica à de antes → *Retomar envios*.
- **Manual, a trava:** sincronizar imediatamente após o pareamento, antes de a Evolution
  carregar os chats, deve abrir uma **confirmação** dizendo que vieram ZERO grupos e
  recomendando cancelar e esperar um minuto — e **cancelar não pode mudar nada** na
  contagem de grupos em uso. Confirmar desativaria a lista de propósito; só faça isso se
  a intenção for essa.

## Riscos

- **Logout numa instância já desconectada** pode voltar erro da Evolution. Mitigado por o
  botão só aparecer com `state !== "close"`; numa corrida, a mensagem crua aparece na
  faixa e o `refresh` no `finally` de `run`/`runSync` mostra o estado verdadeiro mesmo
  quando a action lança — é ele quem entrega essa garantia, rodando tanto no sucesso
  quanto no erro. Nada fica inconsistente.
- **Esquecer de retomar** deixa a fila parada indefinidamente. Mitigado pela faixa
  vermelha permanente no topo de `/disparos` com o motivo.
- **A trava da metade gera ruído legítimo**: se você sair de verdade de muitos grupos, ela
  vai pedir confirmação. É uma confirmação, não um bloqueio — custo aceitável.
- **Envios já reivindicados por um lote de `dispatchDue` em andamento no momento do
  clique** ainda podem seguir até o fim mesmo depois da pausa ser gravada — um lote
  reivindica até 10 linhas de uma vez, cada uma com até 20s de timeout para a Evolution
  responder. Não é uma janela de milissegundos: é da ordem de segundos a poucos minutos
  no pior caso. É limitado e se autocorrige — `claim_scheduled_sends` checa a pausa antes
  de cada nova reivindicação, então as tentativas não se acumulam de lote em lote — e não
  vale transação distribuída para fechar essa janela por completo.
- **Se o número novo não estiver em algum grupo**, aquele grupo é desativado na
  sincronização — comportamento correto e reversível, mas vale conferir a contagem de
  "grupos em uso" depois da troca.
