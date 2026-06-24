"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage } from "@/lib/db/types";
import { refineCampaignAction } from "../../actions";

export function RefineChat({
  campaignId,
  initialMessages,
}: {
  campaignId: string;
  initialMessages: ChatMessage[];
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [initialMessages.length, pending]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || pending) return;
    setInput("");
    setError(null);
    startTransition(async () => {
      try {
        await refineCampaignAction(campaignId, msg);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha no refino.");
      }
    });
  }

  return (
    <aside className="flex flex-col h-full bg-white border-l border-line">
      <div className="px-4 py-3 border-b border-line">
        <h2 className="font-display font-bold text-sm">Refinar campanha</h2>
        <p className="font-mono text-[10px] text-muted mt-0.5">Descreva o que ajustar</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {initialMessages.length === 0 && !pending && (
          <p className="text-center font-mono text-xs text-muted mt-8">
            Ex.: &quot;reescreve o toque 2 mais agressivo&quot;, &quot;mais urgência na promo sem hype&quot;, &quot;resolve o risco do toque 3&quot;.
          </p>
        )}
        {initialMessages.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap max-w-[92%] ${
              m.role === "user"
                ? "ml-auto bg-emerald text-white"
                : "mr-auto bg-line/40 text-ink"
            }`}
          >
            {m.content}
          </div>
        ))}
        {pending && (
          <div className="mr-auto bg-line/40 text-ink2 rounded-xl px-3 py-2 text-sm font-mono animate-pulse">
            Refinando…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-3 border-t border-line">
        {error && <p className="text-xs text-risk mb-2">{error}</p>}
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-emerald placeholder:text-muted"
            placeholder="O que você quer ajustar?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={pending}
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="rounded-lg bg-emerald hover:bg-emeraldd transition text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            →
          </button>
        </div>
      </form>
    </aside>
  );
}
