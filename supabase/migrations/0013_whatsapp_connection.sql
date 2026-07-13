-- Conexão WhatsApp: comunidades passam a guardar o JID real do grupo,
-- sincronizado da Evolution API. Antes disso, "comunidade" era só um rótulo.

alter table public.communities add column if not exists wa_group_id text;
alter table public.communities add column if not exists wa_subject  text        not null default '';
alter table public.communities add column if not exists active      boolean     not null default true;
alter table public.communities add column if not exists synced_at   timestamptz;

-- Único quando preenchido; comunidades ainda não vinculadas ficam com null.
create unique index if not exists communities_wa_group_id_key
  on public.communities (wa_group_id)
  where wa_group_id is not null;

-- Flags globais. Linha única garantida pelo check no PK.
-- sends_paused é o botão de pânico: checado dentro do claim da fila.
create table if not exists public.app_settings (
  id            boolean primary key default true check (id),
  sends_paused  boolean     not null default false,
  paused_reason text        not null default '',
  updated_at    timestamptz not null default now()
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
drop policy if exists "auth all app_settings" on public.app_settings;
create policy "auth all app_settings" on public.app_settings
  for all to authenticated using (true) with check (true);
