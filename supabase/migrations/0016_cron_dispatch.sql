-- O relógio do agendamento.
--
-- O cron da Vercel no plano Hobby só roda 1x por dia — inútil para agendar por
-- horário. pg_cron roda a cada minuto, é grátis, e não depende do plano.
--
-- A URL e o segredo vivem no Supabase Vault, não aqui: esta migration entra no git.
-- Passo manual, uma vez, no SQL Editor:
--
--   select vault.create_secret('https://<app>.vercel.app/api/cron/dispatch', 'dispatch_url',    'worker de disparo');
--   select vault.create_secret('<mesmo valor de CRON_SECRET>',               'dispatch_secret', 'header x-cron-secret');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.dispatch_tick()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'dispatch_secret';

  -- Segredos ainda não configurados: não faz nada, em vez de encher o log de erro.
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

-- cron.schedule faz upsert pelo jobname, então esta migration é reexecutável.
select cron.schedule('dispatch-sends', '* * * * *', $$select public.dispatch_tick();$$);
