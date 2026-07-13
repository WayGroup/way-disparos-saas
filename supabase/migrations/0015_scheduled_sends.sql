-- A fila de envio. Uma linha por (peça × grupo) — é o que dá status individual,
-- retry por grupo e espaçamento entre grupos.
--
-- Envio avulso: campaign_id e post_id ficam null; o conteúdo vive no payload.

create table if not exists public.scheduled_sends (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null,
  campaign_id     uuid references public.campaigns(id)            on delete cascade,
  post_id         uuid references public.campaign_group_posts(id) on delete cascade,
  community_id    uuid references public.communities(id)          on delete set null,

  -- Snapshots: o grupo pode ser renomeado ou sumir entre agendar e enviar.
  wa_group_id     text not null,
  wa_subject      text not null default '',

  scheduled_at    timestamptz not null,
  -- Backoff do retry. Null = usa scheduled_at.
  next_attempt_at timestamptz,

  status          text not null default 'pendente'
                    check (status in ('pendente','enviando','enviado','falhou','cancelado')),
  attempts        int  not null default 0,
  last_error      text not null default '',

  claimed_at      timestamptz,
  sent_at         timestamptz,
  wa_message_id   text,

  -- Snapshot do texto e da mídia no momento do agendamento: editar a peça
  -- depois não muda, sozinho, o que já está prestes a sair.
  payload         jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now()
);

create index if not exists scheduled_sends_due_idx
  on public.scheduled_sends (scheduled_at) where status = 'pendente';
create index if not exists scheduled_sends_batch_idx    on public.scheduled_sends (batch_id);
create index if not exists scheduled_sends_campaign_idx on public.scheduled_sends (campaign_id);
create index if not exists scheduled_sends_log_idx      on public.scheduled_sends (status, scheduled_at desc);

-- Trava de idempotência: a mesma peça não pode estar viva duas vezes no mesmo grupo.
create unique index if not exists scheduled_sends_post_group_live_idx
  on public.scheduled_sends (post_id, wa_group_id)
  where post_id is not null and status in ('pendente','enviando','enviado');

alter table public.scheduled_sends enable row level security;
drop policy if exists "auth all scheduled_sends" on public.scheduled_sends;
create policy "auth all scheduled_sends" on public.scheduled_sends
  for all to authenticated using (true) with check (true);

-- campaigns.status nunca teve CHECK. Agora tem: aprovada é o gatilho do envio.
alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in ('rascunho','aprovada'));

-- ---------------------------------------------------------------------------
-- CLAIM ATÔMICO
-- Dois ticks do cron podem se atropelar. SKIP LOCKED + attempts++ na mesma
-- transação garantem que ninguém pega a mesma linha duas vezes.
-- ---------------------------------------------------------------------------
create or replace function public.claim_scheduled_sends(p_limit int default 10)
returns setof public.scheduled_sends
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paused boolean;
begin
  -- Botão de pânico checado AQUI, não no worker: nem uma linha é entregue.
  select sends_paused into v_paused from public.app_settings where id = true;
  if coalesce(v_paused, false) then
    return;
  end if;

  return query
  with due as (
    select s.id
      from public.scheduled_sends s
      left join public.campaigns c on c.id = s.campaign_id
     where s.status = 'pendente'
       and s.scheduled_at <= now()
       and coalesce(s.next_attempt_at, s.scheduled_at) <= now()
       and s.attempts < 3
       -- Gate: só campanha aprovada dispara. Avulso (sem campanha) é sempre elegível.
       and (s.campaign_id is null or c.status = 'aprovada')
     order by s.scheduled_at
     limit p_limit
     for update of s skip locked
  )
  update public.scheduled_sends t
     set status     = 'enviando',
         attempts   = t.attempts + 1,
         claimed_at = now()
    from due
   where t.id = due.id
  returning t.*;
end;
$$;

-- ---------------------------------------------------------------------------
-- FINALIZAÇÃO
-- Falha explícita volta para pendente com backoff 3^n min, até 3 tentativas.
-- Linha presa em 'enviando' NUNCA volta sozinha: a mensagem pode ter saído.
-- ---------------------------------------------------------------------------
create or replace function public.complete_scheduled_send(
  p_id uuid,
  p_ok boolean,
  p_wa_message_id text,
  p_error text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts int;
begin
  select attempts into v_attempts from public.scheduled_sends where id = p_id;
  if v_attempts is null then return; end if;

  if p_ok then
    update public.scheduled_sends
       set status          = 'enviado',
           sent_at         = now(),
           wa_message_id   = p_wa_message_id,
           last_error      = '',
           next_attempt_at = null
     where id = p_id;
  else
    update public.scheduled_sends
       set status          = case when v_attempts >= 3 then 'falhou' else 'pendente' end,
           next_attempt_at = case when v_attempts >= 3 then null
                                  else now() + (power(3, v_attempts) * interval '1 minute') end,
           last_error      = left(coalesce(p_error, ''), 2000)
     where id = p_id;
  end if;
end;
$$;

-- Só o worker (service_role) executa. Nem anon nem usuário logado.
revoke all on function public.claim_scheduled_sends(int) from public, anon, authenticated;
revoke all on function public.complete_scheduled_send(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.claim_scheduled_sends(int) to service_role;
grant execute on function public.complete_scheduled_send(uuid, boolean, text, text) to service_role;
