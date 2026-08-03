"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Community } from "@/lib/db/types";
import type { EvoConnectionState, EvoQrCode } from "@/lib/evolution/types";
import {
  fetchQrCodeAction,
  refreshStateAction,
  syncGroupsAction,
  setPauseAction,
  disconnectNumberAction,
  type SyncResult,
} from "../actions";
import { GroupPicker } from "./group-picker";

const STATE_LABEL: Record<EvoConnectionState, string> = {
  open: "Conectado",
  connecting: "Conectando",
  close: "Desconectado",
};

export function ConnectionStrip({
  state,
  configError,
  groups,
  paused,
  pausedReason,
}: {
  state: EvoConnectionState | null;
  configError: string | null;
  groups: Community[];
  paused: boolean;
  pausedReason: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(configError !== null || state !== "open");
  const [qr, setQr] = useState<EvoQrCode | null>(null);
  // Só a variante de sucesso vira estado: a de confirmação é tratada na hora, não exibida.
  const [sync, setSync] = useState<Extract<SyncResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Só existe para o rótulo do botão de sincronizar: `pending` sozinho não diz QUAL
  // operação está em voo, e as três dividem o mesmo useTransition (os botões já ficam
  // todos desabilitados via `pending`, então não há necessidade de mais estado que isso).
  const [syncing, setSyncing] = useState(false);
  const [pauseDraft, setPauseDraft] = useState("");
  const polling = useRef(false);

  const enabled = groups.filter((g) => g.enabled).length;

  // Enquanto o QR está na tela, pergunta o estado até parear.
  useEffect(() => {
    if (!qr?.base64 || polling.current) return;
    polling.current = true;
    const timer = setInterval(async () => {
      try {
        const { state: next } = await refreshStateAction();
        if (next === "open") {
          setQr(null);
          clearInterval(timer);
          polling.current = false;
          router.refresh();
        }
      } catch {
        /* o próximo tick tenta de novo */
      }
    }, 3000);
    return () => {
      clearInterval(timer);
      polling.current = false;
    };
  }, [qr?.base64, router]);

  function run<T>(fn: () => Promise<T>, onOk: (r: T) => void) {
    setError(null);
    startTransition(async () => {
      try {
        onOk(await fn());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Algo deu errado.");
      } finally {
        // Sempre atualiza, mesmo no erro: `disconnectNumberAction` grava a pausa ANTES
        // de tentar o logout, então uma falha no logout ainda deixa a pausa valendo no
        // servidor. Sem o refresh aqui, a faixa continuaria mostrando "Conectado" sem a
        // tarja vermelha até alguém recarregar a página — uma pausa invisível.
        router.refresh();
      }
    });
  }

  function togglePause() {
    if (!paused && !confirm("Pausar TODOS os envios?\n\nNada sai até você retomar.")) return;
    run(
      () => setPauseAction(!paused, paused ? "" : pauseDraft),
      () => setPauseDraft(""),
    );
  }

  /**
   * Sincroniza, e se a resposta pedir confirmação (lista vazia ou desativação de mais da
   * metade dos grupos), pergunta e repete com `confirmed = true`. Transição própria em
   * vez de reusar `run`: o `onOk` de `run` não serve a um fluxo de confirmar-e-repetir,
   * que precisa decidir, a partir do resultado, se pergunta e chama a si mesma de novo.
   */
  function runSync(confirmed: boolean) {
    setError(null);
    setSyncing(true);
    startTransition(async () => {
      // Decide fora do try/finally se vai repetir: chamar `runSync(true)` ainda dentro
      // do finally (ou antes dele) abriria uma segunda transição enquanto esta ainda
      // está se encerrando, e o `finally` desta aqui apagaria o `syncing` da repetição
      // assim que ela começasse.
      let retry = false;
      try {
        const result = await syncGroupsAction(confirmed);
        if (result.ok) {
          setSync(result);
          return;
        }
        const message =
          result.reason === "empty"
            ? `A Evolution devolveu ZERO grupos, mas você tem ${result.total} sincronizado(s).\n\n` +
              "Isso quase sempre significa que ela ainda está carregando as conversas depois " +
              "do pareamento — não que os grupos sumiram de verdade.\n\n" +
              "O certo é cancelar, esperar um minuto e sincronizar de novo. " +
              `Continuar agora desativaria os ${result.total} grupo(s).\n\nContinuar mesmo assim?`
            : `Isso vai desativar ${result.deactivating} dos ${result.total} grupos sincronizados.\n\n` +
              "Se você não saiu desses grupos de propósito, a Evolution pode ainda estar " +
              "carregando as conversas do número recém-pareado.\n\nContinuar mesmo assim?";
        retry = confirm(message);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Algo deu errado.");
      } finally {
        // Sempre atualiza, mesmo quando a action lançou: mesma razão do `run` — o
        // servidor pode ter mudado de estado mesmo numa chamada que terminou em erro.
        router.refresh();
        setSyncing(false);
      }
      if (retry) runSync(true);
    });
  }

  function disconnect() {
    const go = confirm(
      "Desconectar e trocar de número?\n\n" +
        "• Os envios ficam pausados na hora.\n" +
        "• Isso RESETA a conexão e ZERA a lista de grupos — a instância é recriada limpa.\n" +
        "• Os grupos habilitados do número anterior são perdidos (você reescolhe no novo).\n" +
        "• Depois: leia o novo QR com o número novo, sincronize os grupos e retome os envios.",
    );
    if (!go) return;
    run(disconnectNumberAction, () => {
      setQr(null);
      setSync(null);
    });
  }

  return (
    <div
      className={`rounded-xl border bg-white ${paused ? "border-risk/50" : "border-line"}`}
    >
      {/* A linha. Um estado, um número, um botão de parar. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <span className="flex items-center gap-2 text-sm">
          {state === "open" ? (
            <span className="signal-dot" aria-hidden />
          ) : (
            <span
              className={`h-[7px] w-[7px] rounded-full ${state === "connecting" ? "bg-risk" : "bg-muted/50"}`}
              aria-hidden
            />
          )}
          <span className="font-medium">
            {configError ? "Evolution não configurada" : STATE_LABEL[state ?? "close"]}
          </span>
        </span>

        <span className="font-mono text-xs text-muted">
          <strong className="text-ink font-semibold">{enabled}</strong> de {groups.length} grupos em
          uso
        </span>

        <button
          onClick={() => setOpen((o) => !o)}
          className="font-mono text-xs text-muted hover:text-ink"
          aria-expanded={open}
        >
          {open ? "▴ fechar" : "▾ gerenciar"}
        </button>

        <div className="ml-auto flex items-center gap-2">
          {!paused && (
            <input
              value={pauseDraft}
              onChange={(e) => setPauseDraft(e.target.value)}
              placeholder="Motivo (opcional)"
              className="w-36 rounded-lg border border-line p-1.5 text-xs"
            />
          )}
          <button
            onClick={togglePause}
            disabled={pending}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
              paused
                ? "bg-emerald text-white hover:bg-emeraldd"
                : "border border-risk text-risk hover:bg-risk/10"
            }`}
          >
            {paused ? "Retomar envios" : "Pausar tudo"}
          </button>
        </div>
      </div>

      {paused && (
        <p className="border-t border-risk/30 bg-risk/10 px-4 py-2 text-xs text-risk">
          <strong>Envios pausados.</strong> Nada cruza a linha do agora — nem o agendado, nem o
          avulso. A fila espera intacta; ao retomar, o que estiver atrasado mais de 2h não é
          entregue (marcado como <em>atrasado demais</em>, com opção de reenviar).
          {pausedReason && <span className="font-mono"> · {pausedReason}</span>}
        </p>
      )}

      {/* A gaveta. Configuração vive aqui, fora do caminho. */}
      {open && (
        <div className="border-t border-line p-4 space-y-4">
          {configError ? (
            <p className="text-sm text-risk">
              {configError} Defina <code className="font-mono text-xs">EVOLUTION_API_URL</code>,{" "}
              <code className="font-mono text-xs">EVOLUTION_API_KEY</code> e{" "}
              <code className="font-mono text-xs">EVOLUTION_INSTANCE</code> no ambiente.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() =>
                    run(fetchQrCodeAction, (r) => {
                      setQr(r);
                      if (!r.base64 && !r.code && r.state !== "open") {
                        setError(
                          "A Evolution respondeu sem QR code. Quase sempre é a instância travada em 'connecting': até a versão 2.2.x o Baileys entra em loop de reconexão antes de gerar o primeiro QR. Atualize para evoapicloud/evolution-api:v2.3.7 ou superior e recrie a instância.",
                        );
                      }
                    })
                  }
                  disabled={pending}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-paper disabled:opacity-50"
                >
                  {state === "open" ? "Gerar novo QR" : "Conectar número"}
                </button>

                {(state === "open" || state === "connecting") && (
                  <button
                    onClick={disconnect}
                    disabled={pending}
                    title="Solta a sessão da Evolution e pausa os envios"
                    className="rounded-lg border border-risk px-3 py-1.5 text-xs font-semibold text-risk transition hover:bg-risk/10 disabled:opacity-50"
                  >
                    Desconectar número
                  </button>
                )}

                <button
                  onClick={() => runSync(false)}
                  disabled={pending || state !== "open"}
                  title={state !== "open" ? "Conecte o número primeiro" : undefined}
                  className="rounded-lg bg-emerald px-3 py-1.5 text-xs font-semibold text-white hover:bg-emeraldd disabled:opacity-50"
                >
                  {pending && syncing ? "Sincronizando…" : "Sincronizar grupos"}
                </button>

                {sync && (
                  <span className="font-mono text-xs text-emeraldd">
                    {sync.inserted} novo(s) · {sync.linked} atualizado(s) · {sync.deactivated}{" "}
                    sumiram
                  </span>
                )}
              </div>

              {qr?.base64 && (
                <div className="flex items-center gap-5 rounded-xl border border-line p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qr.base64}
                    alt="QR code para parear o número"
                    className="h-48 w-48 rounded-lg border border-line"
                  />
                  <div className="text-sm">
                    <p className="font-display font-bold">No celular do número de disparo</p>
                    <p className="mt-1 text-muted">
                      WhatsApp → Aparelhos conectados → Conectar aparelho
                    </p>
                    <p className="mt-3 font-mono text-xs text-muted">
                      A tela se atualiza sozinha ao parear.
                    </p>
                  </div>
                </div>
              )}

              <GroupPicker groups={groups} />
            </>
          )}

          {error && (
            <p className="rounded-lg border border-risk/30 bg-risk/5 p-3 text-sm text-risk">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
