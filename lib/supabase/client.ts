import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";

export function createClient() {
  const { url, anonKey } = getPublicEnv();
  return createBrowserClient(url, anonKey);
}
