export type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
  instance: string;
};

export type EvoConnectionState = "open" | "connecting" | "close";

export type EvoQrCode = {
  state?: EvoConnectionState;
  base64?: string;
  code?: string;
  pairingCode?: string;
};

export type EvoGroup = {
  id: string;
  subject: string;
  size?: number;
  pictureUrl?: string | null;
  isCommunity?: boolean;
  announce?: boolean;
};

export type EvoSendResult = {
  waMessageId: string;
};

/** Uma chamada concreta à Evolution. Uma linha da fila pode virar 1 ou 2 delas. */
export type EvolutionCall =
  | { endpoint: "sendText"; body: { number: string; text: string; linkPreview: boolean } }
  | {
      endpoint: "sendMedia";
      body: {
        number: string;
        mediatype: "image" | "video" | "document";
        media: string;
        mimetype: string;
        caption?: string;
        fileName?: string;
      };
    }
  | { endpoint: "sendWhatsAppAudio"; body: { number: string; audio: string } };
