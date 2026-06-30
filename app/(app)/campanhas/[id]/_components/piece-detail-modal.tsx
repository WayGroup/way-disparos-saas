"use client";

import { useEffect } from "react";
import type { Piece } from "@/lib/campaign-pieces";
import { pieceTime } from "@/lib/campaign-pieces";
import { formatSendAt } from "@/lib/schedule";
import { WhatsappPreview } from "./whatsapp-preview";

export function PieceDetailModal({
  piece,
  onClose,
  onOpenInList,
}: {
  piece: Piece;
  onClose: () => void;
  onOpenInList: (p: Piece) => void;
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
      className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-line max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-emeraldd font-semibold">
                {piece.offset_label}
              </span>
              <h3 className="font-display font-bold">{piece.role}</h3>
            </div>
            <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted">
              <span className="rounded-full bg-ink/8 px-2 py-0.5">
                {piece.track === "api" ? "API" : "GRUPO"}
              </span>
              {piece.send_at && (
                <span>📅 {formatSendAt(piece.send_at)}</span>
              )}
              {piece.meta_category && (
                <span
                  className={
                    piece.meta_category === "UTILITY"
                      ? "text-utility"
                      : "text-marketing"
                  }
                >
                  {piece.meta_category}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink text-lg leading-none"
          >
            ×
          </button>
        </div>

        <WhatsappPreview
          message={piece.message}
          buttons={piece.buttons}
          imageUrl={piece.imageUrl}
          time={pieceTime(piece.send_at) || "11:48"}
        />

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => onOpenInList(piece)}
            className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-4 py-2"
          >
            Abrir na lista →
          </button>
        </div>
      </div>
    </div>
  );
}
