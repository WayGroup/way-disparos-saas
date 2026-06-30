"use client";

import { useRef, useState } from "react";
import type { Piece } from "@/lib/campaign-pieces";
import { pieceTime } from "@/lib/campaign-pieces";
import { WhatsappPreview } from "./whatsapp-preview";

export function HoverPreview({
  piece,
  children,
  onClick,
}: {
  piece: Piece;
  children: React.ReactNode;
  onClick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function show() {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    // posiciona à direita do chip; se faltar espaço, à esquerda
    const left =
      r.right + 280 > window.innerWidth
        ? Math.max(8, r.left - 290)
        : r.right + 8;
    setPos({ top: Math.min(r.top, window.innerHeight - 220), left });
  }

  return (
    <div
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onClick={onClick}
      className="cursor-pointer"
    >
      {children}
      {pos && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ top: pos.top, left: pos.left }}
        >
          <WhatsappPreview
            message={piece.message}
            buttons={piece.buttons}
            imageUrl={piece.imageUrl}
            time={pieceTime(piece.send_at) || "11:48"}
            compact
          />
        </div>
      )}
    </div>
  );
}
