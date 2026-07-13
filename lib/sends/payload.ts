import type { Asset } from "@/lib/db/types";
import type { EvolutionCall } from "@/lib/evolution/types";

export type SendMediaKind = "image" | "video" | "document" | "audio";

export type SendMedia = {
  url: string;
  mediatype: SendMediaKind;
  mimetype: string;
  fileName: string;
};

/** O que uma linha da fila carrega congelado. */
export type SendPayload = {
  text: string;
  media: SendMedia | null;
};

export function mediaTypeFromKind(kind: string): SendMediaKind {
  if (kind === "image") return "image";
  if (kind === "video") return "video";
  if (kind === "audio") return "audio";
  return "document";
}

export function buildSendPayload(
  copy: string,
  asset: Asset | null,
  publicUrl: (storagePath: string) => string,
): SendPayload {
  return {
    text: copy.trim(),
    media: asset
      ? {
          url: publicUrl(asset.storage_path),
          mediatype: mediaTypeFromKind(asset.kind),
          mimetype: asset.mime_type,
          fileName: asset.filename,
        }
      : null,
  };
}

/**
 * Traduz o payload nas chamadas concretas da Evolution.
 *
 * Uma linha da fila pode virar 2 chamadas: a Evolution não aceita legenda em áudio,
 * então áudio com copy vira nota de voz + mensagem de texto, nessa ordem.
 * O wa_message_id gravado é o da última chamada.
 */
export function buildEvolutionPayload(payload: SendPayload, waGroupId: string): EvolutionCall[] {
  const { text, media } = payload;

  if (!media) {
    if (!text) return [];
    return [{ endpoint: "sendText", body: { number: waGroupId, text, linkPreview: true } }];
  }

  if (media.mediatype === "audio") {
    const calls: EvolutionCall[] = [
      { endpoint: "sendWhatsAppAudio", body: { number: waGroupId, audio: media.url } },
    ];
    if (text) {
      calls.push({ endpoint: "sendText", body: { number: waGroupId, text, linkPreview: true } });
    }
    return calls;
  }

  return [
    {
      endpoint: "sendMedia",
      body: {
        number: waGroupId,
        mediatype: media.mediatype,
        media: media.url,
        mimetype: media.mimetype,
        ...(text ? { caption: text } : {}),
        ...(media.mediatype === "document" ? { fileName: media.fileName } : {}),
      },
    },
  ];
}
