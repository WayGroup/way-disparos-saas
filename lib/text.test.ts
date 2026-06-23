import { describe, it, expect } from "vitest";
import { slugifyIdentifier } from "@/lib/text";

describe("slugifyIdentifier", () => {
  it("normaliza acentos, espaços e caixa", () => {
    expect(slugifyIdentifier("Comunidade Nº 1 — Quentes")).toBe("comunidade-no-1-quentes");
  });
  it("colapsa separadores repetidos", () => {
    expect(slugifyIdentifier("  A   B  ")).toBe("a-b");
  });
});
