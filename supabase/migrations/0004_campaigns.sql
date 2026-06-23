create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references public.recipes(id) on delete set null,
  name text not null,
  inputs jsonb not null default '{}'::jsonb,
  status text not null default 'rascunho',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_touches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  sort_order int not null default 0,
  offset_label text not null default '',
  role text not null default '',
  meta_category text not null default 'UTILITY' check (meta_category in ('UTILITY','MARKETING')),
  template_body text not null default '',
  buttons jsonb not null default '[]'::jsonb,
  window_steps jsonb not null default '[]'::jsonb,
  fallback_copy text not null default '',
  crm_action text not null default '',
  risk_flag boolean not null default false
);

create table if not exists public.campaign_group_posts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  sort_order int not null default 0,
  offset_label text not null default '',
  role text not null default '',
  communities text not null default '',
  copy text not null default '',
  media text not null default ''
);

alter table public.campaigns enable row level security;
alter table public.campaign_touches enable row level security;
alter table public.campaign_group_posts enable row level security;

drop policy if exists "auth all campaigns" on public.campaigns;
create policy "auth all campaigns" on public.campaigns for all to authenticated using (true) with check (true);
drop policy if exists "auth all campaign_touches" on public.campaign_touches;
create policy "auth all campaign_touches" on public.campaign_touches for all to authenticated using (true) with check (true);
drop policy if exists "auth all campaign_group_posts" on public.campaign_group_posts;
create policy "auth all campaign_group_posts" on public.campaign_group_posts for all to authenticated using (true) with check (true);
