import { describe, it, expect } from "vitest";
import { NAV_ITEMS, isActiveNav } from "@/lib/nav";

describe("nav", () => {
  it("expõe os itens de navegação na ordem do mockup", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual([
      "/campanhas",
      "/receitas",
      "/midias",
      "/base-conhecimento",
    ]);
  });

  it("marca ativo no match exato", () => {
    expect(isActiveNav("/campanhas", "/campanhas")).toBe(true);
  });

  it("marca ativo em subrota", () => {
    expect(isActiveNav("/base-conhecimento/algum", "/base-conhecimento")).toBe(true);
  });

  it("não marca ativo em rota diferente", () => {
    expect(isActiveNav("/receitas", "/campanhas")).toBe(false);
  });
});
