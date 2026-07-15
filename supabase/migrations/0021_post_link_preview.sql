-- Prévia de link por peça. Antes, o linkPreview era fixo em `true` no código, então
-- toda mensagem com link vinha com o card de imagem — nem sempre desejado.
--
-- Agora é uma escolha por peça, desligada por padrão: o card só aparece quando alguém
-- liga de propósito.

alter table public.campaign_group_posts
  add column if not exists link_preview boolean not null default false;
