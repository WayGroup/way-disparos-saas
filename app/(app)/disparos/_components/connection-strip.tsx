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
  const [sync, setSync] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
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
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Algo deu errado.");
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

                <button
                  onClick={() => run(syncGroupsAction, setSync)}
                  disabled={pending || state !== "open"}
                  title={state !== "open" ? "Conecte o número primeiro" : undefined}
                  className="rounded-lg bg-emerald px-3 py-1.5 text-xs font-semibold text-white hover:bg-emeraldd disabled:opacity-50"
                >
                  {pending ? "Sincronizando…" : "Sincronizar grupos"}
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
