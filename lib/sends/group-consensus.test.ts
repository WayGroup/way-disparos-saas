import { describe, it, expect } from "vitest";
import { groupConsensus } from "@/lib/sends/group-consensus";

describe("groupConsensus", () => {
  it("todas as peças com os mesmos grupos → uniforme", () => {
    expect(groupConsensus([{ community_ids: ["a", "b"] }, { community_ids: ["b", "a"] }])).toEqual({
      uniform: true,
      ids: ["a", "b"],
    });
  });

  it("peças divergentes → não uniforme, com a contagem das que fogem do padrão", () => {
    const r = groupConsensus([
      { community_ids: ["a"] },
      { community_ids: ["a"] },
      { community_ids: ["b"] },
    ]);
    expect(r).toEqual({ uniform: false, customized: 1 });
  });

  it("uma peça sem grupo entre peças com grupo já é divergência", () => {
    const r = groupConsensus([{ community_ids: ["a"] }, { community_ids: [] }]);
    expect(r).toEqual({ uniform: false, customized: 1 });
  });

  it("todas sem grupo → uniforme e vazio", () => {
    expect(groupConsensus([{ community_ids: [] }, { community_ids: [] }])).toEqual({
      uniform: true,
      ids: [],
    });
  });

  it("sem peças → uniforme e vazio", () => {
    expect(groupConsensus([])).toEqual({ uniform: true, ids: [] });
  });

  it("uma peça só → uniforme", () => {
    expect(groupConsensus([{ community_ids: ["x"] }])).toEqual({ uniform: true, ids: ["x"] });
  });
});
