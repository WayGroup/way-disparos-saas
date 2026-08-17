import { describe, it, expect } from "vitest";
import {
  avisoDeData,
  computeSendAt,
  formatSendAt,
  fromDatetimeLocal,
  toDatetimeLocal,
  toInstant,
} from "@/lib/schedule";

describe("toInstant", () => {
  it("converte o horário de São Paulo no instante UTC", () => {
    expect(toInstant("2026-07-20 14:00")).toBe("2026-07-20T17:00:00.000Z");
  });

  it("meia-noite vira 03:00 UTC", () => {
    expect(toInstant("2026-07-20 00:00")).toBe("2026-07-20T03:00:00.000Z");
  });

  it("atravessa a virada do ano corretamente", () => {
    expect(toInstant("2026-12-31 23:30")).toBe("2027-01-01T02:30:00.000Z");
  });

  it("aceita offset customizado", () => {
    expect(toInstant("2026-07-20 14:00", "+00:00")).toBe("2026-07-20T14:00:00.000Z");
  });

  it("devolve null para formato inválido", () => {
    expect(toInstant("")).toBeNull();
    expect(toInstant("20/07/2026 14:00")).toBeNull();
    expect(toInstant("2026-07-20T14:00")).toBeNull();
    expect(toInstant("2026-07-20 14:00:00")).toBeNull();
  });

  it("devolve null para data que não existe", () => {
    expect(toInstant("2026-02-31 14:00")).toBeNull();
  });
});

describe("computeSendAt", () => {
  it("soma dias e usa hora fixa", () => {
    expect(computeSendAt("2026-06-27T19:00", -1, "14:00")).toBe("2026-06-26 14:00");
  });
  it("hora vazia usa a hora da âncora", () => {
    expect(computeSendAt("2026-06-27T19:07", 0, "")).toBe("2026-06-27 19:07");
  });
  it("âncora inválida retorna vazio", () => {
    expect(computeSendAt("", -1, "14:00")).toBe("");
    expect(computeSendAt("xx", 0, "")).toBe("");
  });
  it("desloca a partir da hora do evento (antes)", () => {
    expect(computeSendAt("2026-06-27T19:07", 0, "", -60)).toBe("2026-06-27 18:07");
  });
  it("desloca a partir da hora do evento (depois)", () => {
    expect(computeSendAt("2026-06-27T19:07", 0, "", 13)).toBe("2026-06-27 19:20");
  });
  it("deslocamento rola o dia para trás", () => {
    expect(computeSendAt("2026-06-27T00:30", 0, "", -60)).toBe("2026-06-26 23:30");
  });
  it("deslocamento rola o dia para frente", () => {
    expect(computeSendAt("2026-06-27T23:30", 0, "", 60)).toBe("2026-06-28 00:30");
  });
  it("dias e deslocamento se somam", () => {
    expect(computeSendAt("2026-06-27T19:07", -1, "", -60)).toBe("2026-06-26 18:07");
  });
  it("hora fixa ignora o deslocamento", () => {
    expect(computeSendAt("2026-06-27T19:07", 0, "14:00", -60)).toBe("2026-06-27 14:00");
  });
  it("hora fora de faixa falha alto em vez de rolar o dia", () => {
    expect(computeSendAt("2026-06-27T19:07", 0, "24:00")).toBe("");
    expect(computeSendAt("2026-06-27T19:07", 0, "9:99")).toBe("");
  });
});

describe("formatSendAt", () => {
  it("formata em pt-BR curto", () => {
    expect(formatSendAt("2026-06-26 14:00")).toBe("sex 26/06 · 14:00");
  });
  it("vazio retorna vazio", () => {
    expect(formatSendAt("")).toBe("");
  });
});

describe("toDatetimeLocal", () => {
  it("troca o espaço pelo T que o seletor do navegador espera", () => {
    expect(toDatetimeLocal("2026-08-18 19:07")).toBe("2026-08-18T19:07");
  });

  it("data vazia devolve vazio — peça sem data é estado válido", () => {
    expect(toDatetimeLocal("")).toBe("");
  });

  it("valor malformado devolve vazio, não ele mesmo", () => {
    // Devolver a string original encheria o campo do formulário com lixo que o
    // navegador ignora — e o usuário salvaria sem perceber.
    expect(toDatetimeLocal("18/08/2026 19:07")).toBe("");
    expect(toDatetimeLocal("amanhã")).toBe("");
  });
});

describe("fromDatetimeLocal", () => {
  it("troca o T pelo espaço do formato guardado", () => {
    expect(fromDatetimeLocal("2026-08-18T19:07")).toBe("2026-08-18 19:07");
  });

  it("descarta os segundos que alguns navegadores acrescentam", () => {
    expect(fromDatetimeLocal("2026-08-18T19:07:00")).toBe("2026-08-18 19:07");
  });

  it("valor vazio devolve vazio", () => {
    expect(fromDatetimeLocal("")).toBe("");
  });

  it("valor malformado devolve vazio", () => {
    expect(fromDatetimeLocal("2026-08-18")).toBe("");
  });

  it("ida e volta preserva a data guardada", () => {
    const guardado = "2026-08-17 14:00";
    expect(fromDatetimeLocal(toDatetimeLocal(guardado))).toBe(guardado);
  });
});

describe("avisoDeData", () => {
  const now = new Date("2026-08-17T12:00:00-03:00");

  it("sem nada a avisar, devolve vazio", () => {
    expect(avisoDeData("2026-08-18 19:07", now)).toBe("");
  });

  it("sem data: avisa que a peça fica fora da fila e cancela o que já estava agendado", () => {
    expect(avisoDeData("", now)).toBe(
      "Sem data: a peça não entra na fila até você marcar um horário. Os envios já agendados dela são cancelados.",
    );
  });

  it("data já passou: avisa e cancela o que já estava agendado", () => {
    expect(avisoDeData("2026-08-10 08:00", now)).toBe(
      "Essa data já passou. A peça não entra na fila — nada é agendado para trás. Os envios já agendados dela são cancelados.",
    );
  });

  it("data inválida (casa a regex, mas toInstant rejeita) avisa sem deixar passar em silêncio", () => {
    // Ano digitado como "0026" em vez de "2026": passa em fromDatetimeLocal (\d{4} casa
    // com 4 dígitos), mas toInstant rejeita por causa da regra legada de ano de 2 dígitos
    // do JS (Date.UTC(26, ...) vira 1926). É o caso que hoje não gera nenhum aviso.
    expect(toInstant("0026-08-18 19:07")).toBeNull();
    expect(avisoDeData("0026-08-18 19:07", now)).toBe(
      "Data inválida — confira o ano. A peça não entra na fila, e os envios já agendados dela são cancelados.",
    );
  });
});
