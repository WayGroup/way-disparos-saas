create table if not exists public.copy_chats (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.copy_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.copy_chats(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.copy_chats enable row level security;
alter table public.copy_messages enable row level security;
drop policy if exists "auth all copy_chats" on public.copy_chats;
create policy "auth all copy_chats" on public.copy_chats for all to authenticated using (true) with check (true);
drop policy if exists "auth all copy_messages" on public.copy_messages;
create policy "auth all copy_messages" on public.copy_messages for all to authenticated using (true) with check (true);
