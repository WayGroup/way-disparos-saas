import "server-only";
import { evoUrl } from "@/lib/evolution/url";
import { parseGroupList } from "@/lib/evolution/groups";
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
  init?: { method?: "GET" | "POST" | "DELETE"; body?: unknown; timeoutMs?: number; tolerateStatuses?: number[] },
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
    // Alguns fluxos toleram certos status (ex.: delete de instância inexistente = 404).
    if (init?.tolerateStatuses?.includes(res.status)) return undefined as T;
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
  // Tolera 404: logo após um reset, se o create falhou, a instância não existe. Em vez de
  // estourar (e a tela cair no branch "Evolution não configurada", que esconde tudo),
  // devolvemos "close" — a UI mostra "Conectar número", que recria a instância.
  const data = await evoFetch<{ instance?: { state?: EvoConnectionState } } | undefined>(
    cfg,
    `/instance/connectionState/${cfg.instance}`,
    { tolerateStatuses: [404] },
  );
  return data?.instance?.state ?? "close";
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
 * Deleta a instância na Evolution — apaga a sessão E o histórico de chats persistido
 * (DATABASE_SAVE_DATA_INSTANCE). É o que permite trocar de número sem herdar os grupos do
 * número anterior via /chat/findChats. Tolera 404: instância já inexistente não é erro,
 * então um retry (delete → create) é seguro.
 */
export async function evoDeleteInstance(cfg: EvolutionConfig): Promise<void> {
  await evoFetch<unknown>(cfg, `/instance/delete/${cfg.instance}`, {
    method: "DELETE",
    tolerateStatuses: [404],
  });
}

/**
 * Recria a instância com o MESMO nome e o payload mínimo (sem webhook — o app não usa).
 * Tolera 403/409: instância já existente não é erro (cobre um retry em que o delete
 * anterior não tenha pego). Depois disso, /instance/connect volta a devolver QR.
 */
export async function evoCreateInstance(cfg: EvolutionConfig): Promise<void> {
  await evoFetch<unknown>(cfg, `/instance/create`, {
    method: "POST",
    body: { instanceName: cfg.instance, integration: "WHATSAPP-BAILEYS", qrcode: true },
    tolerateStatuses: [403, 409],
  });
}

/**
 * Lista os grupos do número conectado.
 *
 * USA /group/fetchAllGroups, que pergunta ao WhatsApp de quais grupos o número faz parte.
 *
 * NÃO usamos mais /chat/findChats. Ele lê a tabela de CONVERSAS do Postgres da própria
 * Evolution, e conversa não é grupo: um grupo só aparece ali depois que alguém fala nele.
 * Enquanto a instância era antiga, o histórico acumulado escondia a diferença — quase
 * todo grupo já tinha alguma mensagem. Quando "Desconectar" passou a recriar a instância
 * (que é o que segrega os grupos entre números), a tabela nasceu vazia e o defeito
 * apareceu: grupos parados sumiam do sincronizar, e grupos dos quais o número já saiu
 * continuavam aparecendo, porque a conversa ficou registrada.
 *
 * Medido na instância de produção em 2026-08-05, mesmo número: findChats devolveu 54
 * grupos em 0,5s — faltando 2 reais e sobrando 1 fantasma; fetchAllGroups devolveu os 55
 * corretos em 13,5s. Os nomes batem entre as duas fontes.
 *
 * O comentário anterior aqui dizia que fetchAllGroups não respondia (>90s com 218 grupos).
 * Isso foi medido noutra conta, muito maior. O custo cresce com o número de grupos, então
 * o timeout de 60s continua: é a válvula se um número entrar em grupos demais.
 */
export async function evoListGroups(cfg: EvolutionConfig): Promise<EvoGroup[]> {
  const data = await evoFetch<unknown>(
    cfg,
    `/group/fetchAllGroups/${cfg.instance}?getParticipants=false`,
    { timeoutMs: 60_000 },
  );

  return parseGroupList(data);
}

export async function evoSend(cfg: EvolutionConfig, call: EvolutionCall): Promise<EvoSendResult> {
  const data = await evoFetch<{ key?: { id?: string } }>(
    cfg,
    `/message/${call.endpoint}/${cfg.instance}`,
    { method: "POST", body: call.body },
  );
  return { waMessageId: data.key?.id ?? "" };
}
