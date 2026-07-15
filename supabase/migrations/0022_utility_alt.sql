-- Variante UTILITY alternativa de um toque MARKETING: o mesmo recado reescrito para
-- passar como UTILITY no Meta, com botões próprios e seu risco de reclassificação.
-- null = toque sem alternativa (é UTILITY, ou não foi gerada).
alter table public.campaign_touches
  add column if not exists utility_alt jsonb;
