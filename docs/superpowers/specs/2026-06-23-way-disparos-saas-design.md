# Design — SaaS interno de geração de disparos (Way Group)

**Data:** 2026-06-23
**Status:** aprovado para implementação

## 1. Visão geral

Web app **interno** do Way Group que gera campanhas de disparo de WhatsApp por IA. O
sistema mantém uma **base de conhecimento da marca** (editável ao longo do tempo) e
oferece um **chat conversacional** já carregado com esse contexto para construir
campanhas a partir de **receitas pré-definidas**.

O coração do produto é a **geração de conteúdo** (não o envio). A saída central é a
estrutura de custo do Way: **Template (UTILITY/MARKETING) → Janela 24h → Fallback**,
com mídia sugerida e ação de CRM por toque.

- **Cliente:** uso interno do Way (org única, sem multi-tenant/billing).
- **Receitas no MVP:** Webinário quinzenal + Promo via API pontual.
- **Calibração de tom:** a esteira de Sessão Estratégica (91 dias / 14 toques) do
  documento de contexto serve como referência de tom; **não** é receita do MVP.
- **Abordagem de geração:** híbrida (esqueleto determinístico + refino conversacional).

## 2. Stack

- **Frontend:** Next.js (React, App Router) + Tailwind.
- **Backend:** rotas server-side do Next. A chave da Anthropic fica **exclusivamente no
  servidor**, nunca exposta ao browser.
- **Supabase:** Postgres (dados) + Auth (login do time interno).
- **IA:** Claude via API Anthropic. **Opus 4.8** na geração completa (qualidade da
  copy); **Sonnet 4.6** opcional nos refinos rápidos para reduzir custo. Modelo
  configurável. (Consultar a skill `claude-api` na implementação para IDs/params/tool use.)

## 3. Modelo de dados (Supabase / Postgres)

- **`brand_knowledge`** — base do Way em **blocos tipados e editáveis**:
  marca/missão, mentor (Lucas Arruda), números oficiais, oferta/tiers, personas,
  provas sociais, notícias/autoridade, diretrizes de escrita, **restrições**
  (sem Wesley / sem preço / sem tier) e **regras do modelo de custo**.
  Granular para edição e para montar o prompt.
- **`recipes`** — definição de campanha:
  - metadados (nome, tipo, descrição);
  - **esquema de inputs** (campos que o usuário preenche por campanha — ex.: data/hora
    do webinário, tema, link de inscrição; ou oferta + prazo da promo). Um campo é
    marcado como **âncora** (a data que rege os offsets);
  - **slots de toque por trilha** (ver Seção 3.1) — cada slot tem ordem, offset relativo
    à âncora, papel/objetivo, mídia sugerida e, dependendo da trilha, categoria Meta ou
    comunidades-alvo.
- **`communities`** — as comunidades/grupos do funil (no MVP, 3), editáveis: nome e
  identificador. Usadas como alvo dos posts da trilha de Grupos.
- **`assets`** — **biblioteca de mídias global e reutilizável** (vídeos, imagens, áudios,
  PDFs): arquivo no Supabase Storage + metadados (nome, tipo, tamanho, URL). O Infra
  baixa/copia link daqui. Toques e posts referenciam `assets` por id.
- **`campaigns`** — instância gerada: referência à receita, inputs preenchidos, status
  (rascunho/aprovado).
- **`campaign_touches`** — saída da **trilha API individual** (1 por slot da trilha),
  editável:
  - **template**: categoria Meta + corpo com `{{1}}` + botões;
  - **janela 24h**: sequência de passos, cada um com `asset_id` + legenda;
  - **fallback**: copy para clique "não"/sem engajamento;
  - **ação de CRM**.
- **`campaign_group_posts`** — saída da **trilha de Grupos** (1 por slot de grupo),
  editável: copy do post único, `asset_id` (mídia anexa), e **comunidades-alvo**
  (subconjunto de `communities`). Sem template/janela/fallback nem categoria Meta.
- **`chat_messages`** — histórico do chat de refino por campanha (escopo: trilha e/ou
  toque/post específico).

### 3.1 Trilhas paralelas (canais)

Uma campanha tem **duas trilhas independentes**, geradas e editadas em separado:
- **API individual** — `campaign_touches` com a arquitetura de custo
  Template → Janela 24h → Fallback + categoria Meta (UTILITY/MARKETING).
- **Grupos/Comunidades** — `campaign_group_posts`: posts únicos (copy + mídia) nas
  comunidades selecionadas. A lógica de custo da API individual **não se aplica** aqui.

A receita define, para cada trilha, sua própria lista de slots. O usuário alterna entre
as trilhas por abas no editor e na edição de receita.

Princípio: a **receita** garante o esqueleto (toques/dias/categoria/comunidades sempre
corretos) e a **base de conhecimento** alimenta a copy. Campanha = receita preenchida +
toques (API) + posts (grupos), com mídias vindas da biblioteca de `assets`.

## 4. Motor de geração e refino (abordagem C)

### 4.1 Geração inicial (passada estruturada)
1. Usuário escolhe a receita → formulário derivado do esquema de inputs.
2. Servidor monta o prompt: base de conhecimento compilada + esqueleto da receita +
   inputs da campanha + diretrizes de escrita + regras de custo.
3. Chamada ao Claude com **saída estruturada via tool use** — a IA devolve um JSON com
   todos os toques no formato template/janela/fallback/CRM. JSON fora do schema → retry
   automático (limitado).
4. JSON validado → `campaign_touches` → renderizado como **cards** na ordem da cadência.

### 4.2 Chat de refino
- Painel de chat ao lado dos cards. Pedidos em linguagem natural
  (ex.: "reescreve o toque 3 mais agressivo", "mais urgência na promo sem hype").
- Servidor envia ao Claude: mensagem + estado atual da campanha + toque(s) afetado(s) →
  recebe **apenas os toques alterados** (saída estruturada) → merge nos cards.
- Cada card também tem "regenerar este toque" e edição manual direta.

## 5. Modelo de custo embutido (guardrails)

Regras tratadas como **guardrails do gerador**, não decisão solta da IA:
- Template **leve**, sempre terminando em clique de botão (VÍDEO/SIM/EU QUERO/VAMOS).
- **Mídia persuasiva** (casos, números, notícia, áudios) só na **janela de 24h**
  (grátis), nunca no template.
- Cada toque carrega a **categoria Meta sugerida** e o sistema **sinaliza risco de
  reclassificação** quando um template "utility" tem conteúdo promocional demais.
- Fallback nunca queima o lead: reconhece e mantém a porta aberta.

## 6. Telas

- **Login** — Supabase Auth (org única). Tudo atrás de login.
- **Campanhas** — lista (status rascunho/aprovado) + "Nova campanha", com **filtros**
  (busca, tipo de campanha, status e intervalo de datas).
- **Nova campanha** — escolhe receita → formulário de inputs → "Gerar".
- **Editor de campanha** — **abas de trilha** (API individual / Grupos); na trilha API,
  cards dos toques (Template/Janela/Fallback) com vínculo de mídia; na trilha Grupos,
  posts únicos com comunidades-alvo e mídia. Chat de refino à direita. Cada card tem
  **Editar** (edição manual direta) e **Regenerar**. Botão **Mídias da campanha** abre a
  visão de assets escopada à campanha. Marcar como aprovada.
- **Mídias** — biblioteca global: upload (vídeo/imagem/áudio/PDF), **filtros** (busca,
  tipo, data, ordenação), baixar/copiar link e "usado em N campanhas". É de onde o Infra
  retira os arquivos.
- **Mídias da campanha** — subconjunto da biblioteca escopado a uma campanha: mostra cada
  asset com o(s) toque(s)/post(s) que o usam, permite upload direto (vai pra biblioteca
  global já vinculado) e "Baixar todas (.zip)" para o Infra.
- **Base de conhecimento** — editar os blocos do Way; gerenciar as comunidades do funil.
- **Receitas** — criar/editar receitas (metadados, esquema de inputs com âncora, e slots
  por trilha: API individual com categoria Meta, Grupos com comunidades-alvo).

## 7. Autenticação

Supabase Auth, **org única**; todo membro logado acessa tudo (sem papéis complexos no
MVP). RLS liberando apenas usuários autenticados.

## 8. Testes (TDD)

- **Unitários:** montagem do prompt, validação do schema da saída estruturada, lógica de
  merge dos toques no refino, cálculo de dias/offsets da cadência.
- **Integração:** endpoint de geração com **Claude mockado** (sem gastar API), checando
  schema de entrada válido e estrutura de saída completa.

## 9. Tratamento de erros

- Falha/timeout da API Claude → retry com backoff + mensagem clara.
- Saída fora do schema → retry automático limitado; se persistir, erro sem perder o já
  gerado.
- Geração parcial → salva como rascunho, nunca perde trabalho.
- Rate limit → fila/aviso ao usuário.

## 10. Fora de escopo (fases futuras)

- Envio/orquestração/agendamento via WhatsApp API e postagem nas comunidades (o Infra
  faz isso manualmente; o SaaS gera o conteúdo e hospeda as mídias).
- Exports (CSV formato longo, HTML/PDF legível, lista de templates Meta) — possíveis na
  fase 2.
- Receita da esteira de 91 dias como campanha utilizável.
- Multi-tenant, billing, papéis/permissões.
- Adaptação para e-mail e variações A/B.
