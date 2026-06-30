"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CopyMessage } from "@/lib/db/types";
import { sendCopyMessageAction } from "../../actions";
import { CopyButton } from "./copy-button";

export function CopyChat({
  chatId,
  initialMessages,
}: {
  chatId: string;
  initialMessages: CopyMessage[];
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
        await sendCopyMessageAction(chatId, msg);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao enviar mensagem.");
      }
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-line">
        <h2 className="font-display font-bold text-sm">Copywriter</h2>
        <p className="font-mono text-[10px] text-muted mt-0.5">Gere qualquer copy na voz da Way</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {initialMessages.length === 0 && !pending && (
          <p className="text-center font-mono text-xs text-muted mt-8">
            Ex.: &quot;me dá 5 destaques pro Instagram sobre o método&quot;, &quot;uma bio curta&quot;, &quot;legenda de carrossel sobre erro de FBA&quot;.
          </p>
        )}
        {initialMessages.map((m) => (
          <div key={m.id} className="flex flex-col">
            <div
              className={`rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap max-w-[92%] ${
                m.role === "user"
                  ? "ml-auto bg-emerald text-white"
                  : "mr-auto bg-line/40 text-ink"
              }`}
            >
              {m.content}
            </div>
            {m.role === "assistant" && (
              <div className="mt-1">
                <CopyButton text={m.content} />
              </div>
            )}
          </div>
        ))}
        {pending && (
          <div className="mr-auto bg-line/40 text-ink2 rounded-xl px-3 py-2 text-sm font-mono animate-pulse">
            Pensando…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-3 border-t border-line">
        {error && <p className="text-xs text-risk mb-2">{error}</p>}
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-emerald placeholder:text-muted"
            placeholder="O que você quer gerar?"
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
    </div>
  );
}
