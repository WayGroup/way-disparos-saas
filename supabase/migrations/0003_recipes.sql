create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  recipe_type text not null default 'custom',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipe_inputs (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  label text not null,
  field_type text not null default 'texto',
  required boolean not null default true,
  is_anchor boolean not null default false,
  sort_order int not null default 0
);

create table if not exists public.recipe_slots (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  track text not null check (track in ('api','grupos')),
  offset_label text not null default '',
  role text not null default '',
  meta_category text check (meta_category in ('UTILITY','MARKETING')),
  target_communities text,
  suggested_media text not null default '',
  sort_order int not null default 0
);

alter table public.recipes enable row level security;
alter table public.recipe_inputs enable row level security;
alter table public.recipe_slots enable row level security;

drop policy if exists "auth all recipes" on public.recipes;
create policy "auth all recipes" on public.recipes for all to authenticated using (true) with check (true);
drop policy if exists "auth all recipe_inputs" on public.recipe_inputs;
create policy "auth all recipe_inputs" on public.recipe_inputs for all to authenticated using (true) with check (true);
drop policy if exists "auth all recipe_slots" on public.recipe_slots;
create policy "auth all recipe_slots" on public.recipe_slots for all to authenticated using (true) with check (true);

-- seed: Webinário quinzenal
do $$
declare wid uuid;
declare pid uuid;
begin
  if not exists (select 1 from public.recipes where recipe_type = 'webinario') then
    insert into public.recipes (name, description, recipe_type, active)
    values ('Webinário quinzenal', 'Convite → lembretes → no ar → reprise, ancorado na data do webinário.', 'webinario', true)
    returning id into wid;

    insert into public.recipe_inputs (recipe_id, label, field_type, required, is_anchor, sort_order) values
      (wid, 'Nome interno', 'texto', true, false, 0),
      (wid, 'Data e hora do webinário', 'data_hora', true, true, 1),
      (wid, 'Tema', 'texto', true, false, 2),
      (wid, 'Link de inscrição', 'url', true, false, 3);

    insert into public.recipe_slots (recipe_id, track, offset_label, role, meta_category, suggested_media, sort_order) values
      (wid, 'api', '-3 dias', 'Convite ao webinário', 'UTILITY', 'Vídeo Lucas 20s + link', 0),
      (wid, 'api', '-1 dia', 'Lembrete + quebra de objeção', 'MARKETING', 'Vídeo case + áudio', 1),
      (wid, 'api', '0 (manhã)', 'Lembrete dia do evento', 'UTILITY', 'Print notícia + teaser', 2),
      (wid, 'api', '0 (1h antes)', 'No ar — link da sala', 'UTILITY', 'Link + recado 10s', 3),
      (wid, 'api', '+1 dia', 'Reprise + ponte pra Sessão', 'MARKETING', 'Reprise + convite Sessão', 4);

    insert into public.recipe_slots (recipe_id, track, offset_label, role, target_communities, suggested_media, sort_order) values
      (wid, 'grupos', '-3 dias', 'Convite ao webinário', '1, 2, 3', 'Vídeo convite', 0),
      (wid, 'grupos', '-1 dia', 'Lembrete + prova social', '1, 2', 'Vídeo case Gustavo', 1),
      (wid, 'grupos', '0 (no ar)', 'No ar — link da sala', '1, 2, 3', 'Banner ao vivo', 2),
      (wid, 'grupos', '+1 dia', 'Reprise + ponte pra Sessão', '1, 2', 'Vídeo reprise', 3);
  end if;

  if not exists (select 1 from public.recipes where recipe_type = 'promo') then
    insert into public.recipes (name, description, recipe_type, active)
    values ('Promo via API (pontual)', 'Disparo curto de oferta com prazo — relâmpago, com janela grátis.', 'promo', true)
    returning id into pid;

    insert into public.recipe_inputs (recipe_id, label, field_type, required, is_anchor, sort_order) values
      (pid, 'Nome interno', 'texto', true, false, 0),
      (pid, 'Oferta', 'texto', true, false, 1),
      (pid, 'Prazo da oferta', 'data_hora', true, true, 2);

    insert into public.recipe_slots (recipe_id, track, offset_label, role, meta_category, suggested_media, sort_order) values
      (pid, 'api', '0', 'Abertura da oferta', 'MARKETING', 'Card oferta', 0),
      (pid, 'api', '+1 dia', 'Reforço / prova', 'MARKETING', 'Vídeo case', 1),
      (pid, 'api', '+2 dias', 'Última chamada', 'UTILITY', 'Card contagem regressiva', 2);
  end if;
end $$;
