"use client";
import { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CampaignWithContent, ChatMessage, Asset } from "@/lib/db/types";
import { approveCampaignAction } from "../../actions";
import { toPieces, type Piece } from "@/lib/campaign-pieces";
import { RefineChat } from "./refine-chat";
import { TouchCard } from "./touch-card";
import { PostCard } from "./post-card";
import { DuplicateButton } from "./duplicate-button";
import { PipelineView } from "./pipeline-view";
import { CalendarView } from "./calendar-view";
import { PieceDetailModal } from "./piece-detail-modal";

type View = "lista" | "pipeline" | "calendario";

export function CampaignView({
  campaign,
  messages,
  assets,
}: {
  campaign: CampaignWithContent;
  messages: ChatMessage[];
  assets: Asset[];
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("lista");
  const [track, setTrack] = useState<"api" | "grupos">("api");
  const [selected, setSelected] = useState<Piece | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [approvePending, startApproveTransition] = useTransition();

  const pieces = useMemo(() => toPieces(campaign, assets), [campaign, assets]);
  const filtered = pieces.filter((p) => p.track === track);

  function openInList(p: Piece) {
    setSelected(null);
    setTrack(p.track);
    setView("lista");
    setFocusKey(p.key);
  }

  useEffect(() => {
    if (!focusKey || view !== "lista") return;
    const el = document.getElementById(focusKey);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightKey(focusKey);
      const t = setTimeout(() => setHighlightKey(null), 1600);
      setFocusKey(null);
      return () => clearTimeout(t);
    }
  }, [focusKey, view]);

  return (
    <div className="h-[calc(100vh-var(--nav-height,56px))] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-paper/90 backdrop-blur border-b border-line px-8 py-4 flex items-center justify-between shrink-0">
        <div>
          <button onClick={() => router.push("/campanhas")} className="font-mono text-xs text-muted hover:text-ink">
            ← Campanhas
          </button>
          <h1 className="font-display font-bold text-2xl mt-0.5">{campaign.name}</h1>
          <div className="flex items-center gap-3 mt-1 font-mono text-xs text-muted">
            <span>{campaign.touches.length} toques</span>
            <span>·</span>
            <span>{campaign.group_posts.length} posts</span>
            <span>·</span>
            <span className={campaign.status === "aprovada" ? "text-emeraldd" : "text-risk"}>{campaign.status}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DuplicateButton campaignId={campaign.id} />
          <button
            onClick={() => startApproveTransition(async () => { await approveCampaignAction(campaign.id); router.refresh(); })}
            disabled={approvePending || campaign.status === "aprovada"}
            className="rounded-lg bg-emerald hover:bg-emeraldd transition text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {campaign.status === "aprovada" ? "Aprovada ✓" : approvePending ? "Aprovando…" : "Aprovar campanha"}
          </button>
        </div>
      </header>

      {/* Controles: visão + filtro de trilha */}
      <div className="px-8 pt-5 pb-3 shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-line/40 rounded-lg p-1 w-fit">
          {(["lista", "pipeline", "calendario"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${view === v ? "bg-white shadow-sm" : "text-muted"}`}
            >
              {v === "lista" ? "Lista" : v === "pipeline" ? "Pipeline" : "Calendário"}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-line/40 rounded-lg p-1 w-fit">
          <button onClick={() => setTrack("api")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${track === "api" ? "bg-white shadow-sm" : "text-muted"}`}>
            API individual <span className="font-mono text-xs text-muted">· {campaign.touches.length}</span>
          </button>
          <button onClick={() => setTrack("grupos")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${track === "grupos" ? "bg-white shadow-sm" : "text-muted"}`}>
            Grupos <span className="font-mono text-xs text-muted">· {campaign.group_posts.length}</span>
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-h-0">
        {view === "lista" ? (
          <div className="h-full grid" style={{ gridTemplateColumns: "1fr 360px" }}>
            <div className="overflow-y-auto px-8 pb-8">
              {track === "api" ? (
                <div className="space-y-5 max-w-3xl">
                  {campaign.touches.map((t) => (
                    <TouchCard key={t.id} campaignId={campaign.id} touch={t} assets={assets} highlight={highlightKey === `api-${t.sort_order}`} />
                  ))}
                </div>
              ) : (
                <div className="space-y-5 max-w-3xl">
                  {campaign.group_posts.map((p) => (
                    <PostCard key={p.id} campaignId={campaign.id} post={p} assets={assets} highlight={highlightKey === `grupos-${p.sort_order}`} />
                  ))}
                </div>
              )}
            </div>
            <RefineChat campaignId={campaign.id} initialMessages={messages} />
          </div>
        ) : (
          <div className="h-full overflow-auto px-8 pb-8">
            {view === "pipeline" ? (
              <PipelineView pieces={filtered} onOpen={setSelected} />
            ) : (
              <CalendarView pieces={filtered} onOpen={setSelected} />
            )}
          </div>
        )}
      </div>

      {selected && <PieceDetailModal piece={selected} onClose={() => setSelected(null)} onOpenInList={openInList} />}
    </div>
  );
}
