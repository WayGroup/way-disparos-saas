import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";

export function createBrowserSupabase() {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv(process.env);
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
