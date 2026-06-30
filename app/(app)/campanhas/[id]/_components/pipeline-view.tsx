"use client";
import type { Piece } from "@/lib/campaign-pieces";
import { groupByDate, pieceTime } from "@/lib/campaign-pieces";
import { HoverPreview } from "./hover-preview";

export function PipelineView({ pieces, onOpen }: { pieces: Piece[]; onOpen: (p: Piece) => void }) {
  const groups = groupByDate(pieces);
  if (pieces.length === 0) {
    return <p className="text-muted text-sm">Nenhuma peça nesta trilha.</p>;
  }
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {groups.map((g) => (
        <div key={g.dateKey || "sem-data"} className="shrink-0 w-72">
          {/* cabeçalho do estágio (dia) */}
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="font-display font-bold text-sm capitalize">{g.label}</span>
            <span className="font-mono text-[11px] text-muted">{g.pieces.length}</span>
          </div>
          <div className="space-y-2">
            {g.pieces.map((p) => (
              <HoverPreview key={p.key} piece={p} onClick={() => onOpen(p)}>
                <div className="rounded-xl border border-line bg-white p-3 hover:border-ink2 transition">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-emeraldd font-semibold">{pieceTime(p.send_at) || p.offset_label}</span>
                    <span className={`rounded-full text-[10px] font-mono px-1.5 py-0.5 ${p.track === "api" ? (p.meta_category === "UTILITY" ? "bg-utility/12 text-utility" : "bg-marketing/12 text-marketing") : "bg-ink/8 text-ink2"}`}>
                      {p.track === "api" ? (p.meta_category ?? "API") : "GRUPO"}
                    </span>
                  </div>
                  <p className="font-display font-bold text-sm mt-1 leading-tight">{p.role}</p>
                  <p className="text-xs text-muted mt-1 line-clamp-2">{p.message}</p>
                </div>
              </HoverPreview>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
