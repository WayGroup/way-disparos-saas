"use client";
import { useEffect } from "react";
import type { Piece } from "@/lib/campaign-pieces";
import type { CampaignTouch, CampaignGroupPost, Asset, Community } from "@/lib/db/types";
import { pieceTime } from "@/lib/campaign-pieces";
import { formatSendAt } from "@/lib/schedule";
import { WhatsappPreview } from "./whatsapp-preview";
import { TouchCard } from "./touch-card";
import { PostCard } from "./post-card";

export function PieceDetailModal({
  piece,
  touch,
  post,
  campaignId,
  assets,
  groups,
  aprovada,
  onClose,
}: {
  piece: Piece;
  touch: CampaignTouch | null;
  post: CampaignGroupPost | null;
  campaignId: string;
  assets: Asset[];
  groups: Community[];
  aprovada: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="bg-paper rounded-2xl border border-line w-full max-w-5xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* cabeçalho */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs text-emeraldd font-semibold shrink-0">{piece.offset_label}</span>
            <h3 className="font-display font-bold truncate">{piece.role}</h3>
            <span className="rounded-full bg-ink/8 text-ink2 text-[10px] font-mono px-2 py-0.5 shrink-0">
              {piece.track === "api" ? "API" : "GRUPO"}
            </span>
            {piece.send_at && (
              <span className="font-mono text-[11px] text-muted shrink-0 hidden sm:inline">📅 {formatSendAt(piece.send_at)}</span>
            )}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-muted hover:text-ink text-xl leading-none shrink-0">×</button>
        </div>

        {/* card completo + prévia ao lado */}
        <div className="grid gap-5 p-5 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            {touch && <TouchCard campaignId={campaignId} touch={touch} assets={assets} />}
            {post && <PostCard campaignId={campaignId} post={post} assets={assets} groups={groups} aprovada={aprovada} />}
            {!touch && !post && <p className="text-sm text-muted">Peça não encontrada.</p>}
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2">Prévia no WhatsApp</div>
            <div className="lg:sticky lg:top-2">
              <WhatsappPreview
                message={piece.message}
                buttons={piece.buttons}
                imageUrl={piece.imageUrl}
                time={pieceTime(piece.send_at) || "11:48"}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
