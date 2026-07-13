-- O alvo de um post em grupo era uma string livre escrita pela IA ("Comunidade 1, 2").
-- Isso não serve para enviar: o WhatsApp precisa do JID. O vínculo vira relacional.
--
-- campaign_group_posts.communities (text) permanece: é o que a IA escreve, e vira
-- a sugestão que o matcher usa para pré-marcar a seleção real.

create table if not exists public.campaign_group_post_communities (
  post_id      uuid not null references public.campaign_group_posts(id) on delete cascade,
  community_id uuid not null references public.communities(id)          on delete cascade,
  primary key (post_id, community_id)
);

create index if not exists cgpc_community_idx
  on public.campaign_group_post_communities (community_id);

alter table public.campaign_group_post_communities enable row level security;
drop policy if exists "auth all cgpc" on public.campaign_group_post_communities;
create policy "auth all cgpc" on public.campaign_group_post_communities
  for all to authenticated using (true) with check (true);
