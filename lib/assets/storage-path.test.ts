import { describe, it, expect } from "vitest";
import { buildStoragePath } from "@/lib/assets/storage-path";

describe("buildStoragePath", () => {
  it("sanitiza o nome e prefixa com a seed", () => {
    expect(buildStoragePath("Vídeo Lucas 20s.mp4", "abc123")).toBe("abc123-video-lucas-20s.mp4");
  });
  it("preserva a extensão e colapsa caracteres inválidos", () => {
    expect(buildStoragePath("Case  Gustavo!!.MP4", "x")).toBe("x-case-gustavo.MP4");
  });
});
