import { describe, it, expect } from "vitest";
import { compileBrandKnowledge } from "@/lib/ai/brand";
import type { BrandBlock } from "@/lib/db/types";

function block(p: Partial<BrandBlock>): BrandBlock {
  return { id: "b", block_key: "k", title: "T", content: "C", sort_order: 0, updated_at: "", ...p };
}

describe("compileBrandKnowledge", () => {
  it("junta blocos como seções título + conteúdo, na ordem recebida", () => {
    const out = compileBrandKnowledge([
      block({ title: "Marca", content: "Way Group" }),
      block({ title: "Restrições", content: "Sem Wesley" }),
    ]);
    expect(out).toContain("## Marca\nWay Group");
    expect(out).toContain("## Restrições\nSem Wesley");
    expect(out.indexOf("Marca")).toBeLessThan(out.indexOf("Restrições"));
  });
});
