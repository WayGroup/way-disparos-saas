alter table public.recipe_slots add column if not exists code text not null default '';
alter table public.campaign_touches add column if not exists template_name text not null default '';
alter table public.campaign_group_posts add column if not exists message_code text not null default '';
