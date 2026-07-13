import type { Asset, SendMediaKind, SendPayload } from "@/lib/db/types";
import type { EvolutionCall } from "@/lib/evolution/types";

export type { SendMedia, SendMediaKind, SendPayload } from "@/lib/db/types";

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
 * REGRA DE OURO: esta ferramenta só envia em grupo. Nunca no privado.
 *
 * No WhatsApp o JID diz o tipo do destino: `…@g.us` é grupo, `…@s.whatsapp.net` é
 * pessoa. Esta é a última porta antes da mensagem sair — se um JID que não é de grupo
 * chegou até aqui, alguma coisa está corrompida e é melhor não enviar nada.
 */
export function isGroupJid(jid: string): boolean {
  return jid.endsWith("@g.us");
}

/**
 * Traduz o payload nas chamadas concretas da Evolution.
 *
 * Uma linha da fila pode virar 2 chamadas: a Evolution não aceita legenda em áudio,
 * então áudio com copy vira nota de voz + mensagem de texto, nessa ordem.
 * O wa_message_id gravado é o da última chamada.
 */
export function buildEvolutionPayload(payload: SendPayload, waGroupId: string): EvolutionCall[] {
  if (!isGroupJid(waGroupId)) {
    throw new Error(
      `Destino não é um grupo: "${waGroupId}". Esta ferramenta não envia mensagem no privado.`,
    );
  }

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
