"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPauseAction } from "../actions";

export function PauseSwitch({ paused, reason }: { paused: boolean; reason: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");

  function toggle() {
    if (!paused && !confirm("Pausar TODOS os envios? Nada sai até você retomar.")) return;
    startTransition(async () => {
      await setPauseAction(!paused, paused ? "" : draft);
      setDraft("");
      router.refresh();
    });
  }

  if (paused) {
    return (
      <div className="rounded-xl border border-risk/40 bg-risk/10 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display font-bold text-risk">Envios pausados</h2>
            <p className="text-sm text-ink2 mt-1">
              Nenhuma mensagem sai — nem as agendadas, nem as avulsas. A fila continua
              crescendo e será entregue quando você retomar.
            </p>
            {reason && <p className="text-sm text-muted mt-2 font-mono">Motivo: {reason}</p>}
          </div>
          <button
            onClick={toggle}
            disabled={pending}
            className="shrink-0 rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-4 py-2 disabled:opacity-50"
          >
            {pending ? "Retomando…" : "Retomar envios"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-bold">Envios ativos</h2>
          <p className="text-sm text-muted mt-1">
            O worker entrega a fila a cada minuto. Se algo errado estiver saindo, pause aqui —
            vale para tudo, sem precisar de deploy.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Motivo (opcional)"
            className="rounded-lg border border-line p-2 text-sm w-44"
          />
          <button
            onClick={toggle}
            disabled={pending}
            className="rounded-lg border border-risk text-risk hover:bg-risk/10 text-sm font-semibold px-4 py-2 disabled:opacity-50"
          >
            {pending ? "Pausando…" : "Pausar tudo"}
          </button>
        </div>
      </div>
    </div>
  );
}
