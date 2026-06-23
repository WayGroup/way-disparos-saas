export interface PublicEnv {
  url: string;
  anonKey: string;
}

export function getPublicEnv(): PublicEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "Variável de ambiente NEXT_PUBLIC_SUPABASE_URL não definida."
    );
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error(
      "Variável de ambiente NEXT_PUBLIC_SUPABASE_ANON_KEY não definida."
    );
  }

  return { url, anonKey };
}
