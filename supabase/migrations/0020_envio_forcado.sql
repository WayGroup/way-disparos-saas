-- "Enviar agora" numa peça de campanha esbarrava em duas coisas que eu mesmo criei ao
-- fazer a campanha montar a fila na geração:
--
-- 1. A peça JÁ ESTÁ na fila. Tentar inserir outra linha para o mesmo (post_id, wa_group_id)
--    viola o índice único de envios vivos → erro 23505 → tela de erro. Ou seja: desde que
--    a fila passou a nascer montada, o "Enviar agora" nunca mais funcionou.
--    Correção (na aplicação): antecipar as linhas que já existem, em vez de inserir novas.
--
-- 2. O claim só entrega envio de campanha APROVADA. Um "Enviar agora" numa campanha em
--    rascunho ficaria eternamente parado — o clique não faria nada.
--    Correção (aqui): a coluna `forced`.
--
-- Um envio forçado pula o portão da aprovação. Isso é correto: alguém clicou em "Enviar
-- agora" naquela peça e confirmou o aviso. Esse clique É a aprovação daquela peça.

alter table public.scheduled_sends
  add column if not exists forced boolean not null default false;

create or replace function public.claim_scheduled_sends(p_limit int default 10)
returns setof public.scheduled_sends
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paused boolean;
begin
  -- Botão de pânico: nem o envio forçado escapa dele.
  select sends_paused into v_paused from public.app_settings where id = true;
  if coalesce(v_paused, false) then
    return;
  end if;

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
       -- Elegível se: forçado à mão, avulso (sem campanha), ou campanha aprovada.
       and (s.forced or s.campaign_id is null or c.status = 'aprovada')
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
