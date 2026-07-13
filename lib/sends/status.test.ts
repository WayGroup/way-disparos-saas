import { describe, it, expect } from "vitest";
import { displayStatus } from "@/lib/sends/status";

describe("displayStatus", () => {
  it("pendente de campanha em rascunho está travado, não pendente", () => {
    expect(displayStatus({ status: "pendente", campaign_status: "rascunho" })).toBe("aguardando");
  });

  it("pendente de campanha aprovada é pendente de verdade", () => {
    expect(displayStatus({ status: "pendente", campaign_status: "aprovada" })).toBe("pendente");
  });

  it("avulso (sem campanha) é sempre elegível, logo pendente de verdade", () => {
    expect(displayStatus({ status: "pendente", campaign_status: null })).toBe("pendente");
  });

  it("os demais status passam direto, mesmo em rascunho", () => {
    expect(displayStatus({ status: "enviado", campaign_status: "rascunho" })).toBe("enviado");
    expect(displayStatus({ status: "enviando", campaign_status: "rascunho" })).toBe("enviando");
    expect(displayStatus({ status: "falhou", campaign_status: null })).toBe("falhou");
    expect(displayStatus({ status: "cancelado", campaign_status: "aprovada" })).toBe("cancelado");
  });
});
