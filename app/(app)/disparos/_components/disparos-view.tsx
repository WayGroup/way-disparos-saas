"use client";
import { useState } from "react";
import type { Asset, Community } from "@/lib/db/types";
import type { SendWithContext } from "@/lib/db/sends";
import type { DisplayStatus } from "@/lib/sends/status";
import type { EvoConnectionState } from "@/lib/evolution/types";
import { ConnectionStrip } from "./connection-strip";
import { QueueTimeline } from "./queue-timeline";
import { QuickSendPanel } from "./quick-send-panel";

export function DisparosView({
  state,
  configError,
  groups,
  activeGroups,
  assets,
  sends,
  counts,
  paused,
  pausedReason,
}: {
  state: EvoConnectionState | null;
  configError: string | null;
  /** Todos os grupos sincronizados — a gaveta de conexão gerencia estes. */
  groups: Community[];
  /** Só os habilitados — os únicos que podem receber disparo. */
  activeGroups: Community[];
  assets: Asset[];
  sends: SendWithContext[];
  counts: Record<DisplayStatus, number>;
  paused: boolean;
  pausedReason: string;
}) {
  const [composing, setComposing] = useState(false);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted">
            Canal WhatsApp · trilha Grupos
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold">Disparos</h1>
        </div>
        <button
          onClick={() => setComposing(true)}
          className="rounded-lg bg-emerald px-4 py-2 text-sm font-semibold text-white transition hover:bg-emeraldd"
        >
          Disparo rápido
        </button>
      </div>

      <div className="mt-6">
        <ConnectionStrip
          state={state}
          configError={configError}
          groups={groups}
          paused={paused}
          pausedReason={pausedReason}
        />
      </div>

      <div className="mt-8">
        <QueueTimeline sends={sends} counts={counts} paused={paused} />
      </div>

      {composing && (
        <QuickSendPanel
          groups={activeGroups}
          assets={assets}
          paused={paused}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
