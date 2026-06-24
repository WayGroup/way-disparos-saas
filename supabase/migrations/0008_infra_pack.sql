alter table public.recipe_slots add column if not exists offset_days int not null default 0;
alter table public.recipe_slots add column if not exists offset_time text not null default '';
alter table public.campaign_touches add column if not exists send_at text not null default '';
alter table public.campaign_group_posts add column if not exists send_at text not null default '';
alter table public.campaign_group_posts add column if not exists asset_id uuid references public.assets(id) on delete set null;
