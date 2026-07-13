import "server-only";
import { evoUrl } from "@/lib/evolution/url";
import type {
  EvoConnectionState,
  EvoGroup,
  EvoQrCode,
  EvoSendResult,
  EvolutionCall,
  EvolutionConfig,
} from "@/lib/evolution/types";

const TIMEOUT_MS = 20_000;

async function evoFetch<T>(
  cfg: EvolutionConfig,
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const res = await fetch(evoUrl(cfg.baseUrl, path), {
    method: init?.method ?? "GET",
    headers: {
      apikey: cfg.apiKey,
      "Content-Type": "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Evolution ${res.status}: ${text.slice(0, 500)}`);
  }

  return (await res.json()) as T;
}

/** Devolve o QR code para parear o número. Se a instância já estiver conectada, vem só o estado. */
export async function evoConnect(cfg: EvolutionConfig): Promise<EvoQrCode> {
  const data = await evoFetch<Record<string, unknown>>(cfg, `/instance/connect/${cfg.instance}`);
  const instance = data.instance as { state?: EvoConnectionState } | undefined;
  return {
    state: instance?.state,
    base64: typeof data.base64 === "string" ? data.base64 : undefined,
    code: typeof data.code === "string" ? data.code : undefined,
    pairingCode: typeof data.pairingCode === "string" ? data.pairingCode : undefined,
  };
}

export async function evoConnectionState(cfg: EvolutionConfig): Promise<EvoConnectionState> {
  const data = await evoFetch<{ instance?: { state?: EvoConnectionState } }>(
    cfg,
    `/instance/connectionState/${cfg.instance}`,
  );
  return data.instance?.state ?? "close";
}

/**
 * getParticipants é obrigatório no schema da Evolution e precisa ser a string "false".
 * Sem ele a chamada devolve 400.
 */
export async function evoFetchAllGroups(cfg: EvolutionConfig): Promise<EvoGroup[]> {
  const data = await evoFetch<unknown>(
    cfg,
    `/group/fetchAllGroups/${cfg.instance}?getParticipants=false`,
  );
  if (!Array.isArray(data)) return [];
  return data
    .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
    .filter((g) => typeof g.id === "string" && (g.id as string).endsWith("@g.us"))
    .map((g) => ({
      id: g.id as string,
      // Alguns grupos voltam sem subject (bug conhecido da Evolution).
      subject: typeof g.subject === "string" ? g.subject : "",
      size: typeof g.size === "number" ? g.size : undefined,
      pictureUrl: typeof g.pictureUrl === "string" ? g.pictureUrl : null,
      isCommunity: g.isCommunity === true,
      announce: g.announce === true,
    }));
}

export async function evoSend(cfg: EvolutionConfig, call: EvolutionCall): Promise<EvoSendResult> {
  const data = await evoFetch<{ key?: { id?: string } }>(
    cfg,
    `/message/${call.endpoint}/${cfg.instance}`,
    { method: "POST", body: call.body },
  );
  return { waMessageId: data.key?.id ?? "" };
}
