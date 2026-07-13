import type { EvolutionConfig } from "@/lib/evolution/types";

export function getEvolutionConfig(source: Record<string, string | undefined>): EvolutionConfig {
  const baseUrl = source.EVOLUTION_API_URL;
  const apiKey = source.EVOLUTION_API_KEY;
  const instance = source.EVOLUTION_INSTANCE;
  if (!baseUrl) throw new Error("Faltando EVOLUTION_API_URL");
  if (!apiKey) throw new Error("Faltando EVOLUTION_API_KEY");
  if (!instance) throw new Error("Faltando EVOLUTION_INSTANCE");
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, instance };
}
