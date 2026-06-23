import { describe, it, expect } from "vitest";
import { assetKindFromMime, formatBytes } from "@/lib/assets/kind";

describe("assetKindFromMime", () => {
  it("classifica por prefixo/typo de mime", () => {
    expect(assetKindFromMime("video/mp4")).toBe("video");
    expect(assetKindFromMime("image/png")).toBe("image");
    expect(assetKindFromMime("audio/mpeg")).toBe("audio");
    expect(assetKindFromMime("application/pdf")).toBe("pdf");
  });
  it("cai em other no desconhecido", () => {
    expect(assetKindFromMime("application/zip")).toBe("other");
  });
});

describe("formatBytes", () => {
  it("formata em unidade legível pt-BR", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(8_200_000)).toBe("7.8 MB");
  });
});
