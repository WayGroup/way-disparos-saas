create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null default '',
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;
drop policy if exists "auth all chat_messages" on public.chat_messages;
create policy "auth all chat_messages" on public.chat_messages for all to authenticated using (true) with check (true);
