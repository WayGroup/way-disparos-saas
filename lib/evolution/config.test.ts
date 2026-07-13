import { describe, it, expect } from "vitest";
import { getEvolutionConfig } from "@/lib/evolution/config";

const full = {
  EVOLUTION_API_URL: "https://evo.way.com/",
  EVOLUTION_API_KEY: "chave",
  EVOLUTION_INSTANCE: "way",
};

describe("getEvolutionConfig", () => {
  it("devolve a config e remove a barra final da URL", () => {
    expect(getEvolutionConfig(full)).toEqual({
      baseUrl: "https://evo.way.com",
      apiKey: "chave",
      instance: "way",
    });
  });

  it("lança quando falta a URL", () => {
    expect(() => getEvolutionConfig({ ...full, EVOLUTION_API_URL: undefined })).toThrow(
      /EVOLUTION_API_URL/,
    );
  });

  it("lança quando falta a chave", () => {
    expect(() => getEvolutionConfig({ ...full, EVOLUTION_API_KEY: undefined })).toThrow(
      /EVOLUTION_API_KEY/,
    );
  });

  it("lança quando falta a instância", () => {
    expect(() => getEvolutionConfig({ ...full, EVOLUTION_INSTANCE: undefined })).toThrow(
      /EVOLUTION_INSTANCE/,
    );
  });
});
