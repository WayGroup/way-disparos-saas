alter table public.copy_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;
