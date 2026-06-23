-- brand_knowledge: blocos tipados editáveis da marca Way
create table if not exists public.brand_knowledge (
  id uuid primary key default gen_random_uuid(),
  block_key text not null unique,
  title text not null,
  content text not null default '',
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  identifier text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.brand_knowledge enable row level security;
alter table public.communities enable row level security;

create policy "auth read brand" on public.brand_knowledge for select to authenticated using (true);
create policy "auth write brand" on public.brand_knowledge for update to authenticated using (true) with check (true);
create policy "auth all communities" on public.communities for all to authenticated using (true) with check (true);

-- seed brand_knowledge (Way)
insert into public.brand_knowledge (block_key, title, content, sort_order) values
  ('marca_missao', 'Marca & missão', 'Way Group (BH/MG). Ajudar pessoas comuns a vender na Amazon Brasil com transparência. Pilar: "vender a verdade". Anti-guru, sem hype. Time jovem, pegada leve de fé.', 1),
  ('mentor', 'Mentor — Lucas Arruda', 'Embaixador da Amazon no Brasil. +R$45–55 milhões gerados para mentorados. Destaque no programa Pequenas Empresas & Grandes Negócios (Globo). 8 anos de experiência. Toda copy em 1ª pessoa do Lucas.', 2),
  ('numeros', 'Números oficiais', '+R$55 milhões gerados na Amazon · +500 mentorados em 2 anos · +10.000 alunos em cursos gravados · nota de satisfação 9,58 · Amazon investiu +R$75 bilhões no Brasil · menos de 1% dos vendedores fatura +R$100 mil/mês.', 3),
  ('oferta', 'Oferta / funil', 'Destino: Sessão Estratégica gratuita (call de diagnóstico). NÃO citar preço nem tier nos disparos. CTA sempre = a sessão gratuita. Garantia citada de forma geral (resultado em 6 meses ou dinheiro de volta), sem cravar número de tier.', 4),
  ('personas', 'Personas', 'CLT insatisfeito · Empreendedor frustrado · Investidor conservador · Profissional liberal. Alvo nobre: lead com R$10k+ de capital.', 5),
  ('provas_sociais', 'Provas sociais', 'Gustavo David (R$23k→R$230k em 40 dias) · Fabrício Mafra (R$1mi em 8 meses) · Sérgio Filho (R$500k em 5 meses) · Willer Pierazoli (R$500k em 6 meses) · Guilherme e Cecília (R$284k em 100 dias) · Raphael Rodrigo (R$350k em 6 meses) · Daniel Rangel (R$280k em 100 dias). Todos com vídeo.', 6),
  ('noticias', 'Notícias / autoridade', 'Amazon investiu +R$75 bilhões no Brasil e elegeu o país como prioridade global de expansão até 2030. ~200 mil vendedores na Amazon Brasil; menos de 1% fatura +R$100k/mês. Diferença do 1% = direção certa + timing.', 7),
  ('diretrizes_escrita', 'Diretrizes de escrita', '1ª pessoa do Lucas, WhatsApp, frases curtas, direto, sem hype, anti-guru. Toda copy de disparo termina puxando uma resposta de uma palavra/botão (VÍDEO, SIM, EU QUERO, VAMOS). Mídia persuasiva só na janela grátis; template leve.', 8),
  ('restricoes', 'Restrições (travas)', 'SEM Wesley — remover 100% das menções. SEM preço e SEM tier nos disparos. CTA sempre = Sessão Estratégica gratuita. Garantia de forma geral, sem cravar número. Fallback nunca queima o lead.', 9),
  ('modelo_custo', 'Regras do modelo de custo', 'Template leve termina em clique de botão. Mídia persuasiva (casos, números, notícia, áudios) só na janela de 24h (grátis), nunca no template. Cada toque carrega categoria Meta sugerida (UTILITY/MARKETING). Sinalizar risco de reclassificação quando template utility tem conteúdo promocional.', 10)
on conflict (block_key) do nothing;

-- seed communities (genéricas)
insert into public.communities (name, identifier, sort_order) values
  ('Comunidade 1', 'comunidade-1', 1),
  ('Comunidade 2', 'comunidade-2', 2),
  ('Comunidade 3', 'comunidade-3', 3)
on conflict (identifier) do nothing;
