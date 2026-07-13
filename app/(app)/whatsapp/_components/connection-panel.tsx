"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import type { EvoConnectionState, EvoQrCode } from "@/lib/evolution/types";
import { fetchQrCodeAction, refreshStateAction, syncGroupsAction, type SyncResult } from "../actions";

const STATE_LABEL: Record<EvoConnectionState, string> = {
  open: "Conectado",
  connecting: "Conectando…",
  close: "Desconectado",
};

const STATE_STYLE: Record<EvoConnectionState, string> = {
  open: "bg-emerald/10 text-emerald",
  connecting: "bg-amber-100 text-amber-700",
  close: "bg-risk/10 text-risk",
};

export function ConnectionPanel({
  initialState,
  configError,
  syncedCount,
}: {
  initialState: EvoConnectionState | null;
  configError: string | null;
  syncedCount: number;
}) {
  const [state, setState] = useState(initialState);
  const [qr, setQr] = useState<EvoQrCode | null>(null);
  const [sync, setSync] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const polling = useRef(false);

  // Enquanto o QR está na tela, pergunta o estado a cada 3s até parear.
  useEffect(() => {
    if (!qr?.base64 || polling.current) return;
    polling.current = true;
    const timer = setInterval(async () => {
      try {
        const { state: next } = await refreshStateAction();
        setState(next);
        if (next === "open") {
          setQr(null);
          clearInterval(timer);
          polling.current = false;
        }
      } catch {
        // silencioso: o próximo tick tenta de novo
      }
    }, 3000);
    return () => {
      clearInterval(timer);
      polling.current = false;
    };
  }, [qr?.base64]);

  function run<T>(fn: () => Promise<T>, onOk: (result: T) => void) {
    setError(null);
    startTransition(async () => {
      try {
        onOk(await fn());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Algo deu errado.");
      }
    });
  }

  if (configError) {
    return (
      <div className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-display font-bold">Evolution API não configurada</h2>
        <p className="text-sm text-muted mt-1">{configError}</p>
        <p className="text-sm text-muted mt-3">
          Defina <code className="font-mono text-xs">EVOLUTION_API_URL</code>,{" "}
          <code className="font-mono text-xs">EVOLUTION_API_KEY</code> e{" "}
          <code className="font-mono text-xs">EVOLUTION_INSTANCE</code> no ambiente e recarregue.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold">Número de disparo</h2>
            <p className="text-sm text-muted mt-1">
              Um número dedicado, pareado por QR code. Nunca use o número pessoal de alguém.
            </p>
          </div>
          {state && (
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATE_STYLE[state]}`}>
              {STATE_LABEL[state]}
            </span>
          )}
        </div>

        {qr?.base64 && (
          <div className="mt-4 flex items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.base64} alt="QR code de pareamento" className="h-56 w-56 rounded-lg border border-line" />
            <div className="text-sm text-muted">
              <p className="font-semibold text-ink">No celular do número de disparo:</p>
              <p className="mt-1">WhatsApp → Aparelhos conectados → Conectar aparelho</p>
              <p className="mt-3 text-xs">A tela atualiza sozinha quando o pareamento terminar.</p>
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() =>
              run(fetchQrCodeAction, (result) => {
                setQr(result);
                if (result.state) setState(result.state);
                // A Evolution respondeu 200 mas sem QR nenhum. Sem esta mensagem, a tela
                // fica em branco e ninguém entende por quê.
                if (!result.base64 && !result.code && result.state !== "open") {
                  setError(
                    "A Evolution respondeu sem QR code. Quase sempre é a instância travada em 'connecting': " +
                      "nas versões até a 2.2.x o Baileys entra em loop de reconexão antes de gerar o primeiro QR. " +
                      "Atualize a imagem para evoapicloud/evolution-api:v2.3.7 ou superior e recrie a instância.",
                  );
                }
              })
            }
            disabled={pending}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-paper disabled:opacity-50"
          >
            {state === "open" ? "Gerar novo QR" : "Gerar QR code"}
          </button>
          <button
            onClick={() => run(refreshStateAction, (result) => setState(result.state))}
            disabled={pending}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-paper disabled:opacity-50"
          >
            Verificar estado
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display font-bold">Sincronização</h2>
            <p className="text-sm text-muted mt-1">
              Puxa a lista de grupos do número.{" "}
              {syncedCount > 0
                ? `${syncedCount} grupo(s) conhecidos.`
                : "Nenhum grupo ainda."}{" "}
              Sincronizar não habilita ninguém — a escolha é logo abaixo.
            </p>
          </div>
          <button
            onClick={() => run(syncGroupsAction, setSync)}
            disabled={pending || state !== "open"}
            title={state !== "open" ? "Conecte o número primeiro" : undefined}
            className="shrink-0 rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50"
          >
            {pending ? "Sincronizando…" : "Sincronizar grupos"}
          </button>
        </div>

        {sync && (
          <p className="mt-3 text-sm text-emeraldd">
            {sync.inserted} novo(s) · {sync.linked} atualizado(s) · {sync.deactivated} sumiram do
            WhatsApp
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-risk/30 bg-risk/5 p-4 text-sm text-risk">{error}</div>
      )}
    </div>
  );
}
