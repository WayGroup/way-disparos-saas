import { describe, it, expect } from "vitest";
import { utilityAltName } from "@/lib/campaign-touch";

describe("utilityAltName", () => {
  it("acrescenta _util quando há nome", () => {
    expect(utilityAltName("webinario_convite_2807")).toBe("webinario_convite_2807_util");
  });
  it("vazio quando o nome é vazio", () => {
    expect(utilityAltName("")).toBe("");
  });
});
