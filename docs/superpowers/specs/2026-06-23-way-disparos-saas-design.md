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
    do webinário, tema, link de inscrição; ou oferta + prazo da promo);
  - lista ordenada de **slots de toque**, cada slot com: ordem, dia/offset (relativo a
    uma âncora, ex. data do webinário), papel/objetivo, categoria Meta sugerida
    (UTILITY/MARKETING), mídia sugerida e comportamento de fallback.
- **`campaigns`** — instância gerada: referência à receita, inputs preenchidos, status
  (rascunho/aprovado).
- **`campaign_touches`** — saída gerada por slot, editável:
  - **template**: categoria Meta + corpo com `{{1}}` + botões;
  - **janela 24h**: sequência de mídia + legenda por clique de botão;
  - **fallback**: copy para clique "não"/sem engajamento;
  - **ação de CRM**.
- **`chat_messages`** — histórico do chat de refino por campanha (e por toque).

Princípio: a **receita** garante o esqueleto (toques/dias/categoria sempre corretos) e a
**base de conhecimento** alimenta a copy. Campanha = receita preenchida + toques gerados.

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
- **Campanhas** — lista (status rascunho/aprovado) + "Nova campanha".
- **Nova campanha** — escolhe receita → formulário de inputs → "Gerar".
- **Editor de campanha** — cards dos toques (esquerda) + chat de refino (direita);
  editar/regenerar por toque; marcar como aprovada.
- **Base de conhecimento** — editar os blocos do Way.
- **Receitas** — criar/editar receitas (metadados, esquema de inputs, slots de toque).

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

- Envio/orquestração via WhatsApp API (este SaaS só gera conteúdo).
- Exports (CSV formato longo, HTML/PDF legível, lista de templates Meta) — possíveis na
  fase 2.
- Receita da esteira de 91 dias como campanha utilizável.
- Multi-tenant, billing, papéis/permissões.
- Adaptação para e-mail e variações A/B.
