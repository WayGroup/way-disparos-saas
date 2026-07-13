import { describe, it, expect } from "vitest";
import { isPublicPath } from "@/lib/auth/paths";

describe("isPublicPath", () => {
  it("login é público", () => {
    expect(isPublicPath("/login")).toBe(true);
  });
  it("rotas internas são protegidas", () => {
    expect(isPublicPath("/campanhas")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
  });
  it("rotas /auth são públicas", () => {
    expect(isPublicPath("/auth/signout")).toBe(true);
  });

  // Sem isto, o middleware devolve 307 para /login e o worker morre em silêncio.
  it("a rota do cron é pública (ela tem auth própria por header)", () => {
    expect(isPublicPath("/api/cron/dispatch")).toBe(true);
    expect(isPublicPath("/api/cron")).toBe(true);
  });

  it("não libera rotas que só começam parecido com /api/cron", () => {
    expect(isPublicPath("/api/cronx")).toBe(false);
    expect(isPublicPath("/api/outra")).toBe(false);
  });
});
