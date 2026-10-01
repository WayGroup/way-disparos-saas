import { describe, it, expect } from "vitest";
import { parseCopySegments } from "@/lib/ai/copy-segments";

describe("parseCopySegments", () => {
  it("sem marcas → um único segmento de texto", () => {
    expect(parseCopySegments("só um comentário")).toEqual([
      { type: "text", text: "só um comentário" },
    ]);
  });

  it("comentário + copy → texto e copy na ordem", () => {
    const out = parseCopySegments("Aqui vai:\n[[COPY]]\nÉ hoje o Tira-Dúvidas.\n[[/COPY]]");
    expect(out).toEqual([
      { type: "text", text: "Aqui vai:" },
      { type: "copy", text: "É hoje o Tira-Dúvidas." },
    ]);
  });

  it("várias copies com rótulos entre elas", () => {
    const out = parseCopySegments(
      "1) É hoje\n[[COPY]]\nCopy um\n[[/COPY]]\n2) Ao vivo\n[[COPY]]\nCopy dois\n[[/COPY]]",
    );
    expect(out).toEqual([
      { type: "text", text: "1) É hoje" },
      { type: "copy", text: "Copy um" },
      { type: "text", text: "2) Ao vivo" },
      { type: "copy", text: "Copy dois" },
    ]);
  });

  it("preserva quebras de linha internas da copy", () => {
    const out = parseCopySegments("[[COPY]]\nlinha 1\n\nlinha 2\n[[/COPY]]");
    expect(out).toEqual([{ type: "copy", text: "linha 1\n\nlinha 2" }]);
  });

  it("texto depois da última copy vira segmento final", () => {
    const out = parseCopySegments("[[COPY]]\nx\n[[/COPY]]\nqualquer dúvida me chama");
    expect(out).toEqual([
      { type: "copy", text: "x" },
      { type: "text", text: "qualquer dúvida me chama" },
    ]);
  });

  it("bloco vazio é ignorado", () => {
    expect(parseCopySegments("[[COPY]]\n\n[[/COPY]]")).toEqual([]);
  });
});
