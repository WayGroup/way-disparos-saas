# Página única de Disparos + campanhas que agendam sozinhas

Data: 2026-07-13
Status: aprovado
Complementa: `2026-07-13-envio-grupos-agendamento-design.md`

## 1. Por que

Duas dores apareceram assim que a ferramenta encostou em dados reais.

**Três telas para uma coisa só.** `/whatsapp`, `/envios` e `/disparo-rapido` são três recortes do mesmo assunto — mandar mensagem em grupo. Elas têm frequências de uso muito diferentes: a conexão se configura uma vez e nunca mais; a fila se olha todo dia. Três itens de menu para isso é ruído.

**Agendar exigia trabalho repetido.** Os grupos eram escolhidos peça por peça: numa campanha de cinco toques, a mesma seleção cinco vezes. E a fila só existia depois de "Aprovar e agendar" — ou seja, você aprovava sem nunca ter visto o que exatamente ia sair.

## 2. Decisões

| Decisão | Escolha |
|---|---|
| As três telas | Viram uma: `/disparos` |
| Layout | Fila em primeiro plano; conexão vira faixa fina no topo; disparo rápido vira painel |
| Quando a fila é montada | Na geração da campanha — já nas datas e horas de cada peça |
| O que "aprovar" faz | Deixa de criar a fila; passa a **destravá-la** |
| Seleção de grupos | Uma vez, no formulário de nova campanha; copiada para cada peça |
| Divergência por peça | Permitida: a peça é a fonte de verdade e pode ser editada sozinha |

## 3. A página `/disparos`

Substitui as três rotas antigas. Três zonas, na ordem em que são usadas:

**Faixa de conexão** (topo) — estado, número conectado, "N de M grupos em uso" e o **botão de pânico**, sempre à vista. Um `▾ gerenciar` revela o que hoje é a tela inteira de WhatsApp: QR code, sincronizar, e o seletor dos grupos. Fechado por padrão.

**A fila** (corpo) — o que hoje é `/envios`: contadores por status, filtro, cancelar, reenviar, destravar.

**Disparo rápido** (painel lateral) — o compositor abre por cima, com a prévia do WhatsApp, e fecha de volta para a fila.

## 4. A campanha agenda sozinha

O gate de aprovação **já mora no worker**: `claim_scheduled_sends` só entrega envios de campanha com `status = 'aprovada'`. A fila pode então ser montada a qualquer momento — ela simplesmente não anda enquanto a campanha for rascunho.

Logo, "a fila nasce montada mas travada" é: **agendar na geração e não mexer no status.** Aprovar passa a só destravar.

O ganho: assim que a IA termina de gerar, o calendário e a página de disparos já mostram exatamente o que vai sair, para quem e quando — antes de qualquer aprovação.

## 5. Os grupos: um editor em massa, não herança

Para a fila nascer montada, os grupos precisam existir na hora da geração. O formulário de **Nova campanha** ganha o seletor de grupos, ao lado da receita e dos inputs.

**Não haverá tabela de "grupos da campanha".** Herança (*a peça herda da campanha, salvo se sobrescrever*) parece elegante e é uma armadilha: "peça sem grupo" passaria a ter dois significados — "herda" ou "deliberadamente nenhum" — e essa ambiguidade um dia vira mensagem no lugar errado.

Em vez disso, a seleção da campanha é um **editor em massa**:

- Na geração, os grupos escolhidos são **copiados** para a lista de cada peça.
- O cabeçalho da campanha exibe os grupos; alterá-lo pergunta *"aplicar às N peças?"*.
- Cada peça mantém sua própria lista explícita — a **única fonte de verdade**.
- Se as peças divergirem, o cabeçalho diz *"os grupos variam por peça"* em vez de mentir.

Zero schema novo. E "peça sem grupo" só pode significar uma coisa: não vai sair.

## 6. Editar a peça reprograma a fila

Cada linha da fila carrega um **snapshot** do texto e da mídia (congelado no agendamento). Editar a peça depois deixaria a fila velha.

Então toda mutação numa peça da trilha Grupos — texto, mídia, horário, grupos, refino pela IA — dispara um **replanejamento**: apaga os envios `pendente` daquela campanha e remonta. Nunca toca no que já foi enviado ou está saindo.

Duas posturas diferentes, de propósito:

- **Replanejar é tolerante.** Peça sem grupo simplesmente não gera linha. É o estado "ainda estou montando".
- **Aprovar é rigoroso.** Qualquer peça inagendável bloqueia a aprovação inteira, com a lista de problemas. É o estado "isso vai pro ar".

## 7. Um estado novo na fila

Com a fila nascendo cheia, a página de disparos passa a exibir envios `pendente` de campanhas ainda em rascunho — que **não vão sair**. Chamá-los de "pendente" seria mentira.

Eles ganham um selo próprio, **"aguardando aprovação"**, derivado (`status = 'pendente' AND campanha = 'rascunho'`), visualmente distinto de "pendente", que significa "vai sair na hora marcada". Nenhuma coluna nova: é uma leitura, não um estado persistido.

## 8. Fora de escopo

Trilha API (segue manual) · herança de grupos por receita · agendar sem revisão humana (a campanha nunca dispara sem aprovação explícita).

## 9. Pré-requisito operacional registrado

O número hoje conectado (`5511999999999`, perfil "uma pessoa do time") é um WhatsApp de trabalho real: 2.848 contatos e 220 grupos de cliente. A decisão tomada foi **testar nele, produzir noutro**: antes de qualquer disparo real, o canal deve ser trocado por um chip dedicado. Um ban leva junto o WhatsApp da pessoa e o acesso aos grupos.
