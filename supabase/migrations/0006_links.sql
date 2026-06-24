create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  url text not null default '',
  description text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.links enable row level security;
drop policy if exists "auth all links" on public.links;
create policy "auth all links" on public.links for all to authenticated using (true) with check (true);

-- seed dos links padrão (preencher a URL depois)
do $$
begin
  if not exists (select 1 from public.links) then
    insert into public.links (label, description, sort_order) values
      ('Sessão Estratégica', 'Agendamento da consultoria/diagnóstico gratuito', 0),
      ('MZHUB', 'Ferramenta de mineração de produtos por dados', 1),
      ('Gestor Seller', 'Ferramenta financeira do seller', 2),
      ('Abertura de CNPJ', 'Fluxo de criação de CNPJ para o aluno', 3);
  end if;
end $$;
