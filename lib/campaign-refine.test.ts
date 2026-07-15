import { describe, it, expect } from "vitest";
import { nextSortOrder, pickReferenceGroups, slugCode, formatAddedSeal } from "@/lib/campaign-refine";

describe("nextSortOrder", () => {
  it("vazio → 0", () => expect(nextSortOrder([])).toBe(0));
  it("sequência → max+1", () =>
    expect(nextSortOrder([{ sort_order: 0 }, { sort_order: 1 }, { sort_order: 2 }])).toBe(3));
  it("com buracos/fora de ordem → max+1", () =>
    expect(nextSortOrder([{ sort_order: 5 }, { sort_order: 2 }])).toBe(6));
});

describe("pickReferenceGroups", () => {
  it("escolhe o post com mais grupos", () =>
    expect(pickReferenceGroups([
      { sort_order: 0, community_ids: ["a"] },
      { sort_order: 1, community_ids: ["a", "b", "c"] },
    ])).toEqual(["a", "b", "c"]));
  it("empate → menor sort_order", () =>
    expect(pickReferenceGroups([
      { sort_order: 2, community_ids: ["x", "y"] },
      { sort_order: 1, community_ids: ["p", "q"] },
    ])).toEqual(["p", "q"]));
  it("nenhum com grupo → []", () =>
    expect(pickReferenceGroups([
      { sort_order: 0, community_ids: [] },
      { sort_order: 1, community_ids: [] },
    ])).toEqual([]));
  it("lista vazia → []", () => expect(pickReferenceGroups([])).toEqual([]));
});

describe("slugCode", () => {
  it("papel → slug", () => expect(slugCode("Convite ao webinário")).toBe("convite-ao-webinario"));
});

describe("formatAddedSeal", () => {
  it("nada → string vazia", () => expect(formatAddedSeal(0, 0)).toBe(""));
  it("posts e toques → plural", () =>
    expect(formatAddedSeal(6, 2)).toBe("✓ 6 posts e 2 toques adicionados.\n\n"));
  it("um post só → singular", () =>
    expect(formatAddedSeal(1, 0)).toBe("✓ 1 post adicionado.\n\n"));
  it("um toque só → singular", () =>
    expect(formatAddedSeal(0, 1)).toBe("✓ 1 toque adicionado.\n\n"));
});
