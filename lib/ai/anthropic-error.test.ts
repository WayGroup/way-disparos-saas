import { describe, it, expect } from "vitest";
import { friendlyAnthropicError } from "@/lib/ai/anthropic-error";

// Shape real de um erro do SDK da Anthropic (status + body aninhado error.error.message).
function apiError(status: number, message: string) {
  return { status, error: { type: "error", error: { type: "invalid_request_error", message } } };
}

describe("friendlyAnthropicError", () => {
  it("sem créditos → mensagem de billing acionável", () => {
    const e = friendlyAnthropicError(
      apiError(400, "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."),
    );
    expect(e.message).toContain("sem créditos");
    expect(e.message).toContain("Plans & Billing");
  });

  it("429 → limite de taxa", () => {
    expect(friendlyAnthropicError(apiError(429, "rate limit")).message).toMatch(/Muitas requisições/);
  });

  it("529 → sobrecarga", () => {
    expect(friendlyAnthropicError(apiError(529, "Overloaded")).message).toMatch(/sobrecarregada/);
  });

  it("401 → chave inválida", () => {
    expect(friendlyAnthropicError(apiError(401, "invalid x-api-key")).message).toMatch(/chave da API/);
  });

  it("desconhecido → preserva a mensagem original", () => {
    expect(friendlyAnthropicError(apiError(400, "algo estranho")).message).toBe("Erro na IA: algo estranho");
  });

  it("erro sem corpo → mensagem genérica", () => {
    expect(friendlyAnthropicError(new Error("")).message).toMatch(/não respondeu como esperado/);
  });
});
