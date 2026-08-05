import { describe, it, expect } from "vitest";
import { parseGroupList } from "@/lib/evolution/groups";

/**
 * Item real de /group/fetchAllGroups?getParticipants=false, capturado da instância de
 * produção em 2026-08-05 (campos irrelevantes ao nosso uso mantidos de propósito: o
 * parser tem que conviver com eles).
 */
function item(over: Record<string, unknown> = {}) {
  return {
    id: "120363408239321002@g.us",
    subject: "Começando certo na Amazon - 06/08 às 19:03",
    subjectOwner: "166245567590536@lid",
    subjectTime: 1785519483,
    pictureUrl: "https://pps.whatsapp.net/v/t61.24694-24/653886359.jpg",
    size: 353,
    creation: 1785519483,
    restrict: false,
    announce: false,
    isCommunity: false,
    isCommunityAnnounce: false,
    ...over,
  };
}

describe("parseGroupList", () => {
  it("lê id e subject de um grupo do fetchAllGroups", () => {
    expect(parseGroupList([item()])).toEqual([
      {
        id: "120363408239321002@g.us",
        subject: "Começando certo na Amazon - 06/08 às 19:03",
        size: 353,
        pictureUrl: "https://pps.whatsapp.net/v/t61.24694-24/653886359.jpg",
        isCommunity: false,
        announce: false,
      },
    ]);
  });

  it("traz o grupo mesmo sem conversa registrada — o bug que motivou a troca de endpoint", () => {
    // Estes dois existiam de verdade e sumiam do sincronizar porque ninguém falava
    // neles: /chat/findChats lista conversas, não grupos.
    const parados = [
      item({ id: "120363406272980460@g.us", subject: "IMERSÃO AMAZON 100K - 25/08 💰" }),
      item({ id: "120363409866528653@g.us", subject: "IMERSÃO AMAZON 100K - 25/08 💰 #2" }),
    ];
    expect(parseGroupList(parados).map((g) => g.id)).toEqual([
      "120363406272980460@g.us",
      "120363409866528653@g.us",
    ]);
  });

  it("descarta item sem id utilizável", () => {
    expect(parseGroupList([item({ id: undefined }), item({ id: 42 }), null, "x"])).toEqual([]);
  });

  it("descarta id que não é de grupo", () => {
    expect(parseGroupList([item({ id: "5511999999999@s.whatsapp.net" })])).toEqual([]);
  });

  it("subject ausente vira string vazia (quem nomeia é o planCommunitySync)", () => {
    expect(parseGroupList([item({ subject: undefined })])[0].subject).toBe("");
  });

  it("campos opcionais ausentes não viram lixo", () => {
    const g = parseGroupList([
      item({ pictureUrl: undefined, size: undefined, isCommunity: undefined, announce: undefined }),
    ])[0];
    expect(g.pictureUrl).toBeNull();
    expect(g.size).toBeUndefined();
    expect(g.isCommunity).toBeUndefined();
    expect(g.announce).toBeUndefined();
  });

  it("resposta que não é lista devolve lista vazia em vez de estourar", () => {
    expect(parseGroupList(null)).toEqual([]);
    expect(parseGroupList({ error: "boom" })).toEqual([]);
    expect(parseGroupList(undefined)).toEqual([]);
  });
});
