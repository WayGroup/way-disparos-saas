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
  init?: { method?: "GET" | "POST" | "DELETE"; body?: unknown; timeoutMs?: number },
): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? TIMEOUT_MS;

  let res: Response;
  try {
    res = await fetch(evoUrl(cfg.baseUrl, path), {
      method: init?.method ?? "GET",
      headers: {
        apikey: cfg.apiKey,
        "Content-Type": "application/json",
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // AbortSignal.timeout lança um DOMException, que o Next não consegue serializar
    // ao atravessar uma Server Action — o usuário via um 500 críptico em vez do motivo.
    // Reembrulhar num Error normal preserva a mensagem.
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new Error(`A Evolution não respondeu em ${timeoutMs / 1000}s (${path}).`);
    }
    throw new Error(
      `Falha ao falar com a Evolution: ${e instanceof Error ? e.message : "erro desconhecido"}`,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Evolution ${res.status}: ${text.slice(0, 500)}`);
  }

  // Lido como texto primeiro, não como JSON direto: um 204 ou corpo vazio (a Evolution
  // não promete corpo em toda rota — ex. um /instance/logout futuro) faria `res.json()`
  // lançar um SyntaxError espúrio, transformando uma chamada bem-sucedida em erro na
  // tela. Corpo com conteúdo continua parseado como sempre; só o vazio vira `undefined`.
  const text = await res.text();
  if (text.trim() === "") return undefined as T;
  return JSON.parse(text) as T;
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
 * Solta o número da instância sem destruí-la: mesmo nome, mesmas configurações,
 * mesmo webhook. É o "sair do aparelho conectado" do WhatsApp, disparado por aqui.
 *
 * Depois disso, /instance/connect volta a devolver QR — que é o que permite parear
 * um número diferente. Enquanto a sessão está `open`, ele responde só o estado.
 *
 * A resposta é descartada: o que importa é não ter lançado.
 */
export async function evoLogout(cfg: EvolutionConfig): Promise<void> {
  await evoFetch<unknown>(cfg, `/instance/logout/${cfg.instance}`, { method: "DELETE" });
}

/**
 * Lista os grupos do número conectado.
 *
 * NÃO usamos /group/fetchAllGroups: ele busca a metadata de cada grupo, um por um, e
 * numa conta com muitos grupos simplesmente não responde (medido: >90s sem retorno com
 * 218 grupos, mesmo com getParticipants=false).
 *
 * /chat/findChats lê do Postgres da própria Evolution e devolve tudo de uma vez
 * (medido: 0,5s para os mesmos 218 grupos), com `remoteJid` e `pushName` — que é tudo
 * o que precisamos: o JID e o nome do grupo.
 */
export async function evoListGroups(cfg: EvolutionConfig): Promise<EvoGroup[]> {
  const data = await evoFetch<unknown>(cfg, `/chat/findChats/${cfg.instance}`, {
    method: "POST",
    body: {},
    timeoutMs: 60_000,
  });

  const list = Array.isArray(data) ? data : [];

  return list
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .filter((c) => typeof c.remoteJid === "string" && (c.remoteJid as string).endsWith("@g.us"))
    .map((c) => ({
      id: c.remoteJid as string,
      subject: typeof c.pushName === "string" ? c.pushName : "",
      pictureUrl: typeof c.profilePicUrl === "string" ? c.profilePicUrl : null,
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
