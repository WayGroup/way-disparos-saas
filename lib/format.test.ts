import { describe, it, expect } from "vitest";
import { formatDateTimeBR } from "@/lib/format";

describe("formatDateTimeBR", () => {
  it("formata data/hora no padrão dd/MM/yyyy HH:mm", () => {
    const d = new Date("2026-06-23T14:05:00");
    expect(formatDateTimeBR(d)).toBe("23/06/2026 14:05");
  });
});
