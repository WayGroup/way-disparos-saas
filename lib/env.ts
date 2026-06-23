export function getPublicEnv(source: Record<string, string | undefined>) {
  const supabaseUrl = source.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = source.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl) throw new Error("Faltando NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseAnonKey) throw new Error("Faltando NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return { supabaseUrl, supabaseAnonKey };
}
