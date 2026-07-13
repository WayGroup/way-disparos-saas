-- `active` estava fazendo dois trabalhos: "o grupo existe no WhatsApp" (decidido pela
-- sincronização) e "eu quero usar este grupo" (decidido por uma pessoa). Sobrepor os dois
-- significa que a próxima sincronização religa sozinha um grupo que alguém desligou.
--
-- Agora são dois campos:
--   active  → presente no WhatsApp na última sincronização. Sistema.
--   enabled → escolhido para uso na ferramenta. Pessoa.
--
-- Só dá para disparar num grupo `active AND enabled`.
--
-- Nasce false: puxar 200+ grupos do WhatsApp não pode significar que todos viraram
-- alvo de disparo. A escolha é explícita.

alter table public.communities
  add column if not exists enabled boolean not null default false;

create index if not exists communities_enabled_idx
  on public.communities (enabled) where enabled;
