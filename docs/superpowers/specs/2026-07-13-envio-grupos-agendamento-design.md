# Envio real em grupos de WhatsApp + agendamento

Data: 2026-07-13
Status: aprovado
Substitui: a seção "Fora de escopo" de `2026-06-23-way-disparos-saas-design.md` no que diz respeito a envio e agendamento na trilha Grupos.

## 1. Por que

O spec de junho declarou envio e agendamento explicitamente fora de escopo: o SaaS gerava o conteúdo e o time de Infra copiava, colava e postava à mão nas comunidades. Os últimos incrementos (nomenclatura, `send_at`, botões de copiar, mídia baixável) foram todos no sentido de facilitar essa operação manual.

Essa decisão está sendo revista. A trilha **Grupos** passa a enviar de verdade — no horário agendado, sozinha — e também sob demanda. O trabalho manual de copiar e colar em N comunidades desaparece.

A trilha **API** (mensagens individuais com template/janela/fallback) **continua manual**. Automatizá-la exige base de contatos com telefone, opt-in, LGPD, templates aprovados na Meta e controle da janela de 24h — nada disso existe no app. É outro projeto, do tamanho deste.

## 2. A restrição que rege tudo

**A API oficial da Meta (WhatsApp Cloud API) não envia mensagens em grupos.** Nunca enviou. Grupo só é possível via bibliotecas não-oficiais que se conectam como um celular real (Baileys).

Consequências aceitas:
- A integração é com **Evolution API self-hosted** (Baileys por baixo).
- Exige um **número dedicado**, pareado por QR code. Nunca o número pessoal de ninguém.
- **O número pode ser banido.** Isso não é um bug a ser corrigido, é uma condição do canal. Mitigamos com jitter e envio sequencial, mas o risco não vai a zero.
- As duas trilhas do app nunca passarão pelo mesmo provedor. São canais fisicamente diferentes.

## 3. Decisões de produto

| Decisão | Escolha |
|---|---|
| Envio | Real e automático, só na trilha Grupos |
| Provedor | Evolution API self-hosted |
| Relógio do agendamento | `pg_cron` do Supabase (Vercel Hobby só roda cron 1x/dia) |
| Gate | Só campanha com `status = 'aprovada'` dispara |
| Anti-ban | Delay aleatório de 20–60s entre grupos da mesma peça |
| Parada de emergência | Botão de pânico global (`app_settings.sends_paused`) |
| Envio sob demanda | "Enviar agora" em qualquer peça + tela de Disparo rápido (texto digitado, sem campanha) |

## 4. As cinco decisões técnicas que carregam o desenho

**Grupos viram entidade real.** `communities` passa a guardar o JID (`120363…@g.us`) sincronizado da Evolution. O vínculo peça→grupo, hoje uma string livre que a própria IA escreve, vira join table. O texto da IA sobrevive como *sugestão*: um matcher o resolve contra os grupos reais e pré-marca a seleção.

**Uma linha de fila por (peça × grupo).** Não uma por peça. É o que dá status individual ("enviou em 4 dos 5 grupos"), retry por grupo e espaçamento por grupo.

**O jitter mora no `scheduled_at`, não num `sleep`.** Cinco grupos às 10h nascem com 10:00:00, 10:00:37, 10:01:15, … O worker só processa o que venceu, sem dormir. Isso sobrevive a crash, timeout e reexecução do cron — e cabe no teto de 60s de função da Vercel Hobby, que um `sleep` de vários minutos estouraria.

**O conteúdo é congelado no agendamento.** Cada linha da fila carrega um `payload jsonb` com o texto e a mídia do momento em que foi agendada. Editar a peça amanhã não muda, sozinho, o que está prestes a sair hoje.

**Nada é reenviado automaticamente.** Se um envio ficar preso em `enviando` (a função morreu entre chamar a Evolution e gravar o resultado), o app **não** tenta de novo — a mensagem *pode* ter saído. Numa ferramenta de broadcast, a mesma mensagem duas vezes em 12 comunidades é pior do que nenhuma. Quem decide reenviar é uma pessoa, na tela `/envios`. Retry automático só em falha explícita (erro HTTP da Evolution antes do envio), com backoff, até 3 tentativas.

## 5. Componentes

- **`lib/evolution/`** — o adaptador. `client.ts` (server-only, os 5 endpoints), `sync.ts` (`planCommunitySync`, puro), `url.ts`. Nada do resto do app conhece a Evolution.
- **`lib/sends/`** — o cérebro, todo puro e testável: `plan.ts` (`planSends`), `jitter.ts`, `payload.ts` (payload → chamadas Evolution), `match.ts` (texto da IA → grupos), `validate.ts`. Único arquivo impuro: `dispatch.ts`.
- **`scheduled_sends`** — a fila. Fonte única da verdade sobre o que saiu, o que vai sair e o que falhou. Campanha, "enviar agora" e disparo avulso escrevem todos aqui; o avulso simplesmente não tem `campaign_id` nem `post_id`.
- **`/api/cron/dispatch`** — o worker. Acordado por `pg_cron` a cada minuto. Claim atômico com `FOR UPDATE SKIP LOCKED`.
- **Telas novas** — `/whatsapp` (QR, status, sincronizar grupos), `/envios` (log + pânico + cancelar/reenviar), `/disparo-rapido`.

## 6. Fluxo de dados

```
Evolution ──fetchAllGroups──► communities (JID)
                                   │
campanha (IA) ──► group_posts ──► join table ──► planSends() ──► scheduled_sends
                                                                      │
                              pg_cron (1/min) ──► /api/cron/dispatch ─┤
                                                                      ▼
                                                  claim (SKIP LOCKED, checa pânico)
                                                                      ▼
                                                  Evolution ──► grupo do WhatsApp
                                                                      ▼
                                                  complete_scheduled_send()
```

## 7. Erros

- **Validação antes de agendar** (`validateSchedulable`): peça sem grupo, grupo sem JID, `send_at` inválido, peça sem texto e sem mídia. Se houver qualquer problema, "Aprovar e agendar" falha **sem escrever nada** e lista os problemas.
- **Falha explícita da Evolution** → backoff 3ⁿ minutos, 3 tentativas, depois `falhou` com o erro registrado.
- **Preso em `enviando`** → nunca reprocessado; aparece em `/envios` para resolução humana.
- **Pânico ligado** → checado *dentro* da função de claim, não no worker. Nem uma linha é entregue.

## 8. Testes

Segue o padrão do repo: Vitest, só em funções puras, colocado ao lado do código em `lib/`. A Evolution é sempre mockada — nenhum teste toca a rede.

Cobertura obrigatória: `planSends`, `withJitter` (com `rng` injetável), `buildEvolutionPayload`, `matchCommunities`, `planCommunitySync`, `toInstant`, `validateSchedulable`, e o caso `/api/cron` em `isPublicPath`.

## 9. Fora de escopo (continua)

Envio automático na trilha API · base de contatos e telefones · opt-in/LGPD · templates da Meta · multi-tenant · billing · A/B testing · relatórios de engajamento (visualizações, reações).

## 10. Premissas registradas

- **Timezone:** offset fixo `-03:00`. O Brasil aboliu o horário de verão em 2019. Se voltar, o único ponto a mudar é `toInstant` em `lib/schedule.ts`.
- **Bucket `assets` é público:** a Evolution baixa a mídia pela URL pública do Storage. Se o container dela ficar em rede fechada, isso quebra.
- **App single-tenant, RLS permissiva.** Não muda aqui. As funções do worker são `security definer` e só o `service_role` pode executá-las.
