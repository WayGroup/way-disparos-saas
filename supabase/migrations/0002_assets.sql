-- tabela de metadados de mídias
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null unique,
  kind text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.assets enable row level security;

drop policy if exists "auth all assets" on public.assets;
create policy "auth all assets" on public.assets for all to authenticated using (true) with check (true);

-- bucket público de mídias
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do update set public = true;

-- policies de storage no bucket assets
drop policy if exists "assets read public" on storage.objects;
create policy "assets read public" on storage.objects
  for select using (bucket_id = 'assets');

drop policy if exists "assets write auth" on storage.objects;
create policy "assets write auth" on storage.objects
  for insert to authenticated with check (bucket_id = 'assets');

drop policy if exists "assets delete auth" on storage.objects;
create policy "assets delete auth" on storage.objects
  for delete to authenticated using (bucket_id = 'assets');
