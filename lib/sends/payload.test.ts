import { describe, it, expect } from "vitest";
import {
  buildEvolutionPayload,
  buildSendPayload,
  isGroupJid,
  mediaTypeFromKind,
  type SendPayload,
} from "@/lib/sends/payload";
import type { Asset } from "@/lib/db/types";

const JID = "120363000000000001@g.us";

function asset(over: Partial<Asset> = {}): Asset {
  return {
    id: "a1",
    filename: "convite.png",
    storage_path: "2026/convite.png",
    kind: "image",
    mime_type: "image/png",
    size_bytes: 1000,
    created_at: "",
    ...over,
  };
}

const publicUrl = (p: string) => `https://cdn.way.com/${p}`;

// REGRA DE OURO: esta ferramenta só envia em grupo. Nunca no privado.
describe("só grupo, nunca no privado", () => {
  it("reconhece JID de grupo", () => {
    expect(isGroupJid("120363000000000001@g.us")).toBe(true);
  });

  it("rejeita JID de pessoa (privado)", () => {
    expect(isGroupJid("5511999999999@s.whatsapp.net")).toBe(false);
    expect(isGroupJid("5531999999999@lid")).toBe(false);
    expect(isGroupJid("status@broadcast")).toBe(false);
    expect(isGroupJid("5531999999999")).toBe(false);
    expect(isGroupJid("")).toBe(false);
  });

  it("montar mensagem para um número privado é ERRO — nada é enviado", () => {
    const payload: SendPayload = { text: "oi", media: null };
    expect(() => buildEvolutionPayload(payload, "5511999999999@s.whatsapp.net")).toThrow(
      /não envia mensagem no privado/,
    );
  });

  it("nem com mídia: o destino é checado antes de qualquer coisa", () => {
    const payload = buildSendPayload("legenda", asset(), publicUrl);
    expect(() => buildEvolutionPayload(payload, "5531999999999")).toThrow(/não é um grupo/);
  });
});

describe("mediaTypeFromKind", () => {
  it("mapeia os kinds conhecidos", () => {
    expect(mediaTypeFromKind("image")).toBe("image");
    expect(mediaTypeFromKind("video")).toBe("video");
    expect(mediaTypeFromKind("audio")).toBe("audio");
  });

  it("qualquer outro kind vira document", () => {
    expect(mediaTypeFromKind("pdf")).toBe("document");
    expect(mediaTypeFromKind("")).toBe("document");
  });
});

describe("buildSendPayload", () => {
  it("sem asset, só o texto (trimado), prévia de link desligada por padrão", () => {
    expect(buildSendPayload("  Bom dia  ", null, publicUrl)).toEqual({
      text: "Bom dia",
      media: null,
      linkPreview: false,
    });
  });

  it("com asset, resolve a URL pública e o mediatype", () => {
    expect(buildSendPayload("Olha isso", asset(), publicUrl)).toEqual({
      text: "Olha isso",
      media: {
        url: "https://cdn.way.com/2026/convite.png",
        mediatype: "image",
        mimetype: "image/png",
        fileName: "convite.png",
      },
      linkPreview: false,
    });
  });

  it("aceita ligar a prévia de link", () => {
    expect(buildSendPayload("veja o link", null, publicUrl, true).linkPreview).toBe(true);
  });
});

describe("buildEvolutionPayload", () => {
  it("texto puro vira um sendText com o JID no campo number, sem prévia por padrão", () => {
    const payload: SendPayload = { text: "Bom dia", media: null };
    expect(buildEvolutionPayload(payload, JID)).toEqual([
      { endpoint: "sendText", body: { number: JID, text: "Bom dia", linkPreview: false } },
    ]);
  });

  it("respeita a prévia de link ligada no payload", () => {
    const payload: SendPayload = { text: "veja o link", media: null, linkPreview: true };
    const calls = buildEvolutionPayload(payload, JID);
    expect(calls[0]).toEqual({
      endpoint: "sendText",
      body: { number: JID, text: "veja o link", linkPreview: true },
    });
  });

  it("imagem com copy vira um sendMedia com caption", () => {
    const payload = buildSendPayload("Olha isso", asset(), publicUrl);
    expect(buildEvolutionPayload(payload, JID)).toEqual([
      {
        endpoint: "sendMedia",
        body: {
          number: JID,
          mediatype: "image",
          media: "https://cdn.way.com/2026/convite.png",
          mimetype: "image/png",
          caption: "Olha isso",
        },
      },
    ]);
  });

  it("imagem sem copy vai sem caption", () => {
    const payload = buildSendPayload("", asset(), publicUrl);
    const calls = buildEvolutionPayload(payload, JID);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).not.toHaveProperty("caption");
  });

  it("pdf vira document e leva fileName", () => {
    const payload = buildSendPayload(
      "Segue o material",
      asset({ kind: "pdf", filename: "ebook.pdf", mime_type: "application/pdf" }),
      publicUrl,
    );
    const calls = buildEvolutionPayload(payload, JID);
    expect(calls[0]).toEqual({
      endpoint: "sendMedia",
      body: {
        number: JID,
        mediatype: "document",
        media: "https://cdn.way.com/2026/convite.png",
        mimetype: "application/pdf",
        caption: "Segue o material",
        fileName: "ebook.pdf",
      },
    });
  });

  it("áudio com copy vira DUAS chamadas: nota de voz e depois o texto", () => {
    const payload = buildSendPayload(
      "Ouve isso",
      asset({ kind: "audio", filename: "audio.ogg", mime_type: "audio/ogg" }),
      publicUrl,
    );
    const calls = buildEvolutionPayload(payload, JID);
    expect(calls).toHaveLength(2);
    // O campo é `audio`, não `media` — contrato da Evolution.
    expect(calls[0]).toEqual({
      endpoint: "sendWhatsAppAudio",
      body: { number: JID, audio: "https://cdn.way.com/2026/convite.png" },
    });
    expect(calls[1].endpoint).toBe("sendText");
  });

  it("áudio sem copy vira uma chamada só", () => {
    const payload = buildSendPayload("", asset({ kind: "audio" }), publicUrl);
    expect(buildEvolutionPayload(payload, JID)).toHaveLength(1);
  });

  it("sem texto e sem mídia não gera chamada nenhuma", () => {
    expect(buildEvolutionPayload({ text: "", media: null }, JID)).toEqual([]);
  });
});
