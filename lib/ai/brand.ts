import type { BrandBlock } from "@/lib/db/types";

export function compileBrandKnowledge(blocks: BrandBlock[]): string {
  return blocks.map((b) => `## ${b.title}\n${b.content}`).join("\n\n");
}
