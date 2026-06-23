import { describe, it, expect } from "vitest";
import { getPublicEnv } from "@/lib/env";

describe("getPublicEnv", () => {
  it("retorna url e anon key quando presentes", () => {
    const env = getPublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon123",
    });
    expect(env).toEqual({ supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon123" });
  });

  it("lança erro quando falta variável", () => {
    expect(() => getPublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });
});
