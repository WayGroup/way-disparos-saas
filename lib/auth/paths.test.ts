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
});
