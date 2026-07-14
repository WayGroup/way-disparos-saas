-- REGRA: um envio só sai se estiver atrasado no máximo 2 horas.
--
-- O claim entregava tudo que tivesse `scheduled_at <= now()`. Uma campanha cuja data já
-- passou, aprovada por engano, soltava a fila inteira de uma vez — e sem o espaçamento
-- anti-ban, que mora no scheduled_at e também estava todo no passado. Rajada, conteúdo
-- desatualizado, número no caminho do ban.
--
-- Duas horas cobre o atraso legítimo (deploy, worker fora do ar, cron engasgado) sem
-- cobrir "essa mensagem era de ontem".
--
-- A trava do lado da aplicação impede a peça vencida de ENTRAR na fila. Esta aqui pega o
-- outro caso: o envio que ENVELHECEU dentro dela.

alter table public.scheduled_sends drop constraint if exists scheduled_sends_status_check;
alter table public.scheduled_sends
  add constraint scheduled_sends_status_check
  check (status in ('pendente','enviando','enviado','falhou','cancelado','expirado'));

create or replace function public.claim_scheduled_sends(p_limit int default 10)
returns setof public.scheduled_sends
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paused boolean;
begin
  -- Botão de pânico checado ANTES de tudo: com ele ligado nada é entregue e nada expira.
  -- Pausar segura a fila; ela não se degrada sozinha enquanto você decide.
  select sends_paused into v_paused from public.app_settings where id = true;
  if coalesce(v_paused, false) then
    return;
  end if;

  -- Expira o que envelheceu na fila. Não é entregue e não fica fingindo que vai sair.
  -- Continua visível em /disparos, com botão de reenviar, se alguém quiser mesmo assim.
  update public.scheduled_sends
     set status     = 'expirado',
         last_error = 'Passou da janela de 2h de atraso — não foi enviado.'
   where status = 'pendente'
     and scheduled_at < now() - interval '2 hours';

  return query
  with due as (
    select s.id
      from public.scheduled_sends s
      left join public.campaigns c on c.id = s.campaign_id
     where s.status = 'pendente'
       and s.scheduled_at <= now()
       and coalesce(s.next_attempt_at, s.scheduled_at) <= now()
       and s.attempts < 3
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

revoke all on function public.claim_scheduled_sends(int) from public, anon, authenticated;
grant execute on function public.claim_scheduled_sends(int) to service_role;
