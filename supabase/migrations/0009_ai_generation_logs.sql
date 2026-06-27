create table if not exists public.ai_generation_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  recipe_id uuid,
  kind text not null default 'generate',
  ok boolean not null default true,
  error text not null default '',
  duration_ms int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.ai_generation_logs enable row level security;
drop policy if exists "auth all ai_logs" on public.ai_generation_logs;
create policy "auth all ai_logs" on public.ai_generation_logs for all to authenticated using (true) with check (true);
