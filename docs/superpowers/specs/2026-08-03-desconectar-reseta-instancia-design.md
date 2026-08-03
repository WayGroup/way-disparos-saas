# Desconectar reseta a instância (segrega grupos por número)

**Data:** 2026-08-03
**Status:** aprovado, aguardando plano de implementação

## Problema (raiz, confirmada em debugging)

Trocar de número não segrega os grupos: os do número antigo continuam aparecendo e
sendo mirados. Causa raiz **na Evolution**, não no nosso banco:

- `evoListGroups` usa `/chat/findChats` ([client.ts:103](../../../lib/evolution/client.ts)),
  que lê o Postgres da própria Evolution.
- A Evolution **persiste os chats** (`DATABASE_SAVE_DATA_INSTANCE: "true"`,
  [docker-compose.yml:33](../../../docker/evolution/docker-compose.yml)) e o
  `evoLogout` **não os apaga** — só "sai do aparelho".
- Então, ao parear o número B na mesma instância, os chats do número A **continuam** no
  banco da Evolution. `findChats` devolve **A + B misturados**, e a lista não traz "dono"
  do grupo (o JID é o mesmo pra qualquer membro), então não dá para distinguir de quem é.

Evidência: após desativarmos os grupos antigos no nosso banco, um "Sincronizar grupos"
os **reativou** — porque a Evolution ainda os tinha. Enquanto a troca for só `logout`, é
impossível segregar.

## Decisão (do brainstorming)

- **"Desconectar" passa a RESETAR a instância**: em vez de `logout`, faz
  **delete + create** da instância Evolution (mesmo nome). Isso zera o histórico de
  chats; ao parear o número novo e sincronizar, o `findChats` devolve **só** os grupos
  dele. É o único caminho que segrega de verdade.
- **Um botão só** (o próprio "Desconectar" vira o reset) — o usuário abre mão do
  "logout leve".
- **Sem webhook a restaurar:** a instância foi criada com o payload mínimo
  (`{instanceName, integration:"WHATSAPP-BAILEYS", qrcode:true}`,
  [README:52](../../../docker/evolution/README.md)) e o app nunca seta webhook (envio é
  por cron). O `create` do reset usa esse mesmo payload mínimo.
- **Grupos:** desativados (`active=false`), não apagados — somem da lista, histórico de
  `scheduled_sends` fica íntegro.

## Não-objetivos

- Não destruir dados do app (campanhas, fila, receitas) — só a instância Evolution e os
  `communities.active`.
- Não configurar webhook (não existe).
- Não consertar o bug do snapshot da fila (`scheduled_sends` congela `wa_group_id`) —
  segue em aberto, fora deste escopo.
- Não mexer no fluxo de conectar (QR) nem no de sincronizar.

## Escopo

### ① Cliente Evolution — `lib/evolution/client.ts`

- **`evoFetch` ganha `tolerateStatuses?: number[]`** em `init`: se `res.status` estiver
  na lista, retorna `undefined` em vez de lançar. É o que torna delete/create
  idempotentes (retry-safe).
- **`evoDeleteInstance(cfg): Promise<void>`** → `DELETE /instance/delete/{instance}`, com
  `tolerateStatuses: [404]` (instância já inexistente não é erro).
- **`evoCreateInstance(cfg): Promise<void>`** → `POST /instance/create` com body
  `{ instanceName: cfg.instance, integration: "WHATSAPP-BAILEYS", qrcode: true }`, com
  `tolerateStatuses: [403, 409]` (instância já existente não é erro — cobre um retry onde
  o delete anterior não pegou).

### ② Ação — `app/(app)/disparos/actions.ts` (`disconnectNumberAction`)

Passa a ser um **reset**, nesta ordem:

1. `setPauseAction(true, "Troca de número")` (já faz).
2. `await evoLogout(cfg)` **best-effort** (envolto em try/catch que ignora o erro — pode
   já estar deslogado; o objetivo é só soltar a sessão antes do delete).
3. `await evoDeleteInstance(cfg)`.
4. `await evoCreateInstance(cfg)`.
5. **Desativa todos os grupos** (o bloco `update communities set active=false where
   wa_group_id is not null and active=true` já existe do fix anterior — mantido). A
   instância nova nasce vazia; um sync do número novo repovoa.
6. `revalidateAll()`.

Se o `create` (passo 4) falhar, a ação lança — a UI mostra o erro e o usuário clica de
novo; como delete/create toleram 404/já-existe, o retry recria sem sujeira.

### ③ UI — `app/(app)/disparos/_components/connection-strip.tsx`

Trocar o texto do `confirm()` de `disconnect()` ([:144](../../../app/(app)/disparos/_components/connection-strip.tsx))
para refletir o reset:

```
Desconectar e trocar de número?

• Os envios ficam pausados na hora.
• Isso RESETA a conexão e ZERA a lista de grupos — a instância é recriada limpa.
• Depois: leia o novo QR com o número novo, sincronize os grupos e retome os envios.
• Grupos habilitados do número anterior serão perdidos (você reescolhe no número novo).
```

O `run(disconnectNumberAction, …)` e o resto do handler ficam iguais.

## Componentes tocados

| Arquivo | Mudança |
|---|---|
| `lib/evolution/client.ts` | `tolerateStatuses` no `evoFetch` + `evoDeleteInstance` + `evoCreateInstance` (①) |
| `app/(app)/disparos/actions.ts` | `disconnectNumberAction` = pausa → logout best-effort → delete → create → desativa grupos (②) |
| `app/(app)/disparos/_components/connection-strip.tsx` | texto da confirmação (③) |

## Verificação

- **Typecheck + suíte** verdes. Pouca lógica pura nova; o miolo é integração com a
  Evolution de produção e **não é testável daqui**.
- **Manual (você, em produção):** clicar "Desconectar" → confirmar → a instância é
  recriada (tela volta a "Desconectado", QR disponível). Parear o **número novo** →
  "Sincronizar grupos" → conferir que aparecem **só** os grupos do número novo (os
  exclusivos do antigo não voltam). Habilitar os grupos desejados e retomar os envios.
- **Retry:** se der erro no meio, clicar "Desconectar" de novo deve completar sem
  duplicar/sujar (delete/create idempotentes).

## Riscos

- **Operação destrutiva na instância de produção.** Mitigado por: confirmação explícita
  que avisa que zera a lista; delete/create idempotentes; envios pausados antes.
- **Janela delete→create:** se o `create` falhar, a instância fica inexistente até o
  retry — a ação falha alto com mensagem clara; o retry recria. O número fica offline
  nesse intervalo (envios já estavam pausados).
- **Grupos habilitados do número anterior são perdidos** (viram inativos) — é o
  comportamento desejado (segregação); sinalizado na confirmação.
- **Bug do snapshot da fila permanece:** campanhas aprovadas antes da troca ainda têm o
  JID antigo congelado — reaprovar/reagendar no número novo. Fora de escopo, registrado.
