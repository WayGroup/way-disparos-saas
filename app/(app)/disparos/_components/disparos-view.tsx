"use client";
import { useState } from "react";
import Link from "next/link";
import type { Asset, Community } from "@/lib/db/types";
import type { SendWithContext, HistoryPage, SendCampaign } from "@/lib/db/sends";
import type { EvoConnectionState } from "@/lib/evolution/types";
import { displayStatus } from "@/lib/sends/status";
import { ConnectionStrip } from "./connection-strip";
import { Fila } from "./fila";
import { Historico } from "./historico";
import { QuickSendPanel } from "./quick-send-panel";

export function DisparosView({
  state,
  configError,
  groups,
  activeGroups,
  assets,
  paused,
  pausedReason,
  view,
  queueSends,
  history,
  campaigns,
  campaignId,
  historyStatus,
}: {
  state: EvoConnectionState | null;
  configError: string | null;
  groups: Community[];
  activeGroups: Community[];
  assets: Asset[];
  paused: boolean;
  pausedReason: string;
  view: "fila" | "historico";
  queueSends: SendWithContext[];
  history: HistoryPage | null;
  campaigns: SendCampaign[];
  campaignId: string;
  historyStatus: string;
}) {
  const [composing, setComposing] = useState(false);

  // Badge da aba Fila: quantos itens pedem decisão agora (falha/expirado). Stuck é raro
  // e depende do relógio, então fica de fora do contador — a Fila mesma o destaca.
  const attentionCount = queueSends.filter((s) => {
    const st = displayStatus(s);
    return st === "falhou" || st === "expirado";
  }).length;

  const tab = (target: "fila" | "historico", label: string, badge?: number) => (
    <Link
      href={target === "fila" ? "/disparos" : "/disparos?view=historico"}
      className={`relative rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
        view === target ? "bg-white shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"
      }`}
    >
      {label}
      {badge ? (
        <span className="ml-1.5 rounded-full bg-risk/15 px-1.5 text-xs font-medium text-risk">
          {badge}
        </span>
      ) : null}
    </Link>
  );

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

      <div className="mt-8 flex items-center gap-1 border-b border-line pb-3">
        {tab("fila", "Fila", attentionCount)}
        {tab("historico", "Histórico")}
      </div>

      <div className="mt-5">
        {view === "fila" ? (
          <Fila sends={queueSends} paused={paused} />
        ) : (
          history && (
            <Historico
              data={history}
              campaigns={campaigns}
              campaignId={campaignId}
              status={historyStatus}
            />
          )
        )}
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
