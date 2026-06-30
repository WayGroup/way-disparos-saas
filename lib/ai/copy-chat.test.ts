import { describe, it, expect } from "vitest";
import { chatTitleFrom, FREE_CHAT_SYSTEM_PROMPT } from "@/lib/ai/copy-chat";

describe("chatTitleFrom", () => {
  it("usa a primeira linha não-vazia", () => {
    expect(chatTitleFrom("  Destaques do Instagram  ")).toBe("Destaques do Instagram");
  });
  it("corta mensagens longas com reticências", () => {
    const t = chatTitleFrom("a".repeat(60));
    expect(t.endsWith("…")).toBe(true);
    expect(t.length).toBeLessThanOrEqual(49);
  });
  it("vazio vira 'Nova conversa'", () => {
    expect(chatTitleFrom("   ")).toBe("Nova conversa");
  });
});

describe("FREE_CHAT_SYSTEM_PROMPT", () => {
  it("traz a voz e os guardrails", () => {
    expect(FREE_CHAT_SYSTEM_PROMPT).toContain("Lucas Arruda");
    expect(FREE_CHAT_SYSTEM_PROMPT).toMatch(/Wesley/);
    expect(FREE_CHAT_SYSTEM_PROMPT.toLowerCase()).toContain("preço");
  });
});
