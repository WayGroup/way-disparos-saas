"use client";

import { useState } from "react";
import type { Piece } from "@/lib/campaign-pieces";
import {
  pieceDateKey,
  pieceTime,
  formatDayHeader,
  monthMatrix,
  weekDays,
  HOURS,
} from "@/lib/campaign-pieces";
import { HoverPreview } from "./hover-preview";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const WEEK_LABELS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

function chipColor(piece: Piece): string {
  if (piece.track === "api") {
    return piece.meta_category === "UTILITY"
      ? "bg-utility/15 text-utility"
      : "bg-marketing/15 text-marketing";
  }
  return "bg-ink/8 text-ink2";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Build a Map<dateKey, Piece[]> sorted by pieceTime within each bucket
// ---------------------------------------------------------------------------

function buildDateMap(pieces: Piece[]): Map<string, Piece[]> {
  const map = new Map<string, Piece[]>();
  for (const p of pieces) {
    const dk = pieceDateKey(p.send_at);
    const bucket = map.get(dk) ?? [];
    bucket.push(p);
    map.set(dk, bucket);
  }
  // Sort each bucket by time ascending (no time → end)
  for (const bucket of map.values()) {
    bucket.sort((a, b) => {
      const ta = pieceTime(a.send_at);
      const tb = pieceTime(b.send_at);
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return ta.localeCompare(tb);
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Piece chip (shared)
// ---------------------------------------------------------------------------

function PieceChip({
  piece,
  onOpen,
}: {
  piece: Piece;
  onOpen: (p: Piece) => void;
}) {
  const time = pieceTime(piece.send_at);
  return (
    <HoverPreview piece={piece} onClick={() => onOpen(piece)}>
      <div
        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono truncate max-w-full ${chipColor(piece)}`}
      >
        {time && <span className="shrink-0">{time}</span>}
        {piece.mediaMissing && <span className="shrink-0 text-risk" title="Falta mídia">⚠</span>}
        <span className="truncate">{piece.role}</span>
      </div>
    </HoverPreview>
  );
}

// ---------------------------------------------------------------------------
// Month view
// ---------------------------------------------------------------------------

function MonthView({
  refKey,
  dateMap,
  onOpen,
}: {
  refKey: string;
  dateMap: Map<string, Piece[]>;
  onOpen: (p: Piece) => void;
}) {
  const [y, m] = refKey.split("-").map(Number);
  const weeks = monthMatrix(y, m - 1);
  const monthLabel = `${MONTH_NAMES[m - 1]} ${y}`;

  return (
    <div className="space-y-3">
      {/* Month header */}
      <div className="flex items-center gap-2">
        <span className="font-display font-bold text-base capitalize">
          {monthLabel}
        </span>
      </div>

      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 gap-px">
        {WEEK_LABELS.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-mono text-muted pb-1 capitalize"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="space-y-px">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-px">
            {week.map((dk) => {
              const [, cellM] = dk.split("-").map(Number);
              const isOtherMonth = cellM !== m;
              const dayNum = Number(dk.split("-")[2]);
              const dayPieces = dateMap.get(dk) ?? [];
              const shown = dayPieces.slice(0, 3);
              const extra = dayPieces.length - shown.length;

              return (
                <div
                  key={dk}
                  className={`min-h-24 border border-line rounded-sm p-1 flex flex-col gap-0.5 ${
                    isOtherMonth ? "bg-paper/40" : "bg-white"
                  }`}
                >
                  {/* Day number */}
                  <span
                    className={`text-[11px] font-mono leading-none mb-0.5 ${
                      isOtherMonth ? "text-muted opacity-50" : "text-ink2"
                    }`}
                  >
                    {dayNum}
                  </span>

                  {/* Piece chips */}
                  {shown.map((p) => (
                    <PieceChip key={p.key} piece={p} onOpen={onOpen} />
                  ))}

                  {extra > 0 && (
                    <span className="text-[9px] font-mono text-muted pl-1">
                      +{extra}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week view
// ---------------------------------------------------------------------------

function WeekView({
  refKey,
  dateMap,
  onOpen,
}: {
  refKey: string;
  dateMap: Map<string, Piece[]>;
  onOpen: (p: Piece) => void;
}) {
  const days = weekDays(refKey);

  return (
    <div className="space-y-2">
      {/* Day headers */}
      <div className="grid grid-cols-[3rem_repeat(7,1fr)] gap-px">
        {/* Empty corner for hour column */}
        <div />
        {days.map((dk) => (
          <div
            key={dk}
            className="text-center text-[11px] font-mono text-ink2 pb-1 capitalize"
          >
            {capitalize(formatDayHeader(dk))}
          </div>
        ))}
      </div>

      {/* Hour rows */}
      <div className="overflow-y-auto max-h-[70vh] border border-line rounded-xl">
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="grid grid-cols-[3rem_repeat(7,1fr)] gap-px border-t border-line first:border-t-0"
          >
            {/* Hour label */}
            <div className="flex items-start justify-end pr-2 pt-1">
              <span className="text-[10px] font-mono text-muted leading-none">
                {String(hour).padStart(2, "0")}h
              </span>
            </div>

            {/* Day cells */}
            {days.map((dk) => {
              const cellPieces = (dateMap.get(dk) ?? []).filter(
                (p) => Number(pieceTime(p.send_at).split(":")[0]) === hour
              );

              return (
                <div
                  key={dk}
                  className="min-h-12 p-0.5 flex flex-col gap-0.5"
                >
                  {cellPieces.map((p) => (
                    <PieceChip key={p.key} piece={p} onOpen={onOpen} />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function CalendarView({
  pieces,
  onOpen,
}: {
  pieces: Piece[];
  onOpen: (p: Piece) => void;
}) {
  const [mode, setMode] = useState<"month" | "week">("month");

  // Derive reference date: smallest non-empty dateKey
  const dateKeys = pieces
    .map((p) => pieceDateKey(p.send_at))
    .filter(Boolean)
    .sort();

  const refKey = dateKeys[0] ?? "";

  const dateMap = buildDateMap(pieces);

  if (!refKey) {
    return (
      <p className="text-muted text-sm">Sem datas para exibir no calendário.</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toggle Mês | Semana */}
      <div className="flex items-center gap-1 bg-paper rounded-lg p-0.5 w-fit border border-line">
        {(["month", "week"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1 text-xs font-mono rounded-md transition ${
              mode === m
                ? "bg-white text-ink shadow-sm border border-line"
                : "text-muted hover:text-ink2"
            }`}
          >
            {m === "month" ? "Mês" : "Semana"}
          </button>
        ))}
      </div>

      {/* View */}
      {mode === "month" ? (
        <MonthView refKey={refKey} dateMap={dateMap} onOpen={onOpen} />
      ) : (
        <WeekView refKey={refKey} dateMap={dateMap} onOpen={onOpen} />
      )}
    </div>
  );
}
