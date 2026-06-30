import { describe, it, expect } from "vitest";
import { chatTitleFrom, FREE_CHAT_SYSTEM_PROMPT, buildUserContent } from "@/lib/ai/copy-chat";

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

describe("buildUserContent", () => {
  const base = "https://x.supabase.co/storage/v1/object/public/assets/";
  it("texto + imagem + pdf vira blocks na ordem certa", () => {
    const blocks = buildUserContent("oi", [
      { kind: "image", storage_path: "a.png", mime_type: "image/png", filename: "a.png" },
      { kind: "pdf", storage_path: "b.pdf", mime_type: "application/pdf", filename: "b.pdf" },
    ], base) as any[];
    expect(blocks[0]).toEqual({ type: "text", text: "oi" });
    expect(blocks[1]).toEqual({ type: "image", source: { type: "url", url: base + "a.png" } });
    expect(blocks[2]).toEqual({ type: "document", source: { type: "url", url: base + "b.pdf" } });
  });
  it("sem texto começa direto no anexo", () => {
    const blocks = buildUserContent("  ", [
      { kind: "image", storage_path: "a.png", mime_type: "image/png", filename: "a.png" },
    ], base) as any[];
    expect(blocks[0].type).toBe("image");
  });
});
