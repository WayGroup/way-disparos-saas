-- REGRA DE OURO: esta ferramenta só envia em GRUPO. Nunca no privado.
--
-- No WhatsApp, o JID diz o tipo do destino:
--   …@g.us            → grupo
--   …@s.whatsapp.net  → pessoa (privado)
--   …@lid, …@broadcast → outras coisas que não são grupo
--
-- Até aqui, a regra vivia numa única linha de filtro no cliente da Evolution. Um bug,
-- um insert manual ou uma mudança na API bastaria para mandar mensagem no privado de
-- alguém. Uma regra desse peso precisa de trava no banco, não de disciplina.

alter table public.communities drop constraint if exists communities_apenas_grupos;
alter table public.communities add constraint communities_apenas_grupos
  check (wa_group_id is null or wa_group_id like '%@g.us');

alter table public.scheduled_sends drop constraint if exists scheduled_sends_apenas_grupos;
alter table public.scheduled_sends add constraint scheduled_sends_apenas_grupos
  check (wa_group_id like '%@g.us');
