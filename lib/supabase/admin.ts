import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";

/**
 * Cliente com service role: bypassa RLS e é o único que pode executar as funções
 * da fila (claim_scheduled_sends / complete_scheduled_send).
 *
 * Só o worker usa. A chave NUNCA pode ganhar o prefixo NEXT_PUBLIC_ — isso a
 * exporia ao browser e daria acesso total ao banco a qualquer visitante.
 */
export function createAdminSupabase() {
  const { supabaseUrl } = getPublicEnv(process.env);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Faltando SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
