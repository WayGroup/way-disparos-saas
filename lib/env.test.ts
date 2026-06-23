import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getPublicEnv } from "@/lib/env";

describe("getPublicEnv", () => {
  const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    // Restaurar variáveis após cada teste
    if (ORIGINAL_URL === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
    }
    if (ORIGINAL_KEY === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_KEY;
    }
  });

  it("retorna URL e chave anônima quando ambas as variáveis estão definidas", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chave-anonima-teste";

    const env = getPublicEnv();

    expect(env.url).toBe("https://abc.supabase.co");
    expect(env.anonKey).toBe("chave-anonima-teste");
  });

  it("lança erro em PT-BR quando NEXT_PUBLIC_SUPABASE_URL está ausente", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chave-anonima-teste";

    expect(() => getPublicEnv()).toThrow(
      "Variável de ambiente NEXT_PUBLIC_SUPABASE_URL não definida."
    );
  });

  it("lança erro em PT-BR quando NEXT_PUBLIC_SUPABASE_ANON_KEY está ausente", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(() => getPublicEnv()).toThrow(
      "Variável de ambiente NEXT_PUBLIC_SUPABASE_ANON_KEY não definida."
    );
  });
});
