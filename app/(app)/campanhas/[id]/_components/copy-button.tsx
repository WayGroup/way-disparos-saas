"use client";
import { useState } from "react";

export function CopyButton({ text, label = "copiar", className = "" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { if (!text) return; navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      disabled={!text}
      className={`font-mono text-[10px] uppercase tracking-wide text-emeraldd hover:underline disabled:opacity-40 ${className}`}
    >
      {copied ? "copiado ✓" : label}
    </button>
  );
}
