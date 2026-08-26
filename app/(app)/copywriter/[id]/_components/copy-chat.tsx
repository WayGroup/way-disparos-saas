"use client";
import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { CopyMessage } from "@/lib/db/types";
import type { Attachment } from "@/lib/ai/copy-chat";
import { parseCopySegments } from "@/lib/ai/copy-segments";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { buildStoragePath } from "@/lib/assets/storage-path";
import { assetKindFromMime } from "@/lib/assets/kind";
import { sendCopyMessageAction } from "../../actions";
import { CopyButton } from "./copy-button";

const PUBLIC_BASE =
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") + "/storage/v1/object/public/assets/";

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
  const [staged, setStaged] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [initialMessages.length, pending]);

  async function handleFiles(files: FileList) {
    setUploading(true);
    const supabase = createBrowserSupabase();
    const newAttachments: Attachment[] = [];

    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        setError(`Arquivo "${file.name}" é grande demais (>20MB).`);
        continue;
      }
      const kind = assetKindFromMime(file.type);
      if (kind !== "image" && kind !== "pdf") {
        setError(`Arquivo "${file.name}" não é imagem nem PDF.`);
        continue;
      }
      const path = buildStoragePath(file.name, crypto.randomUUID().slice(0, 8));
      const { error: uploadError } = await supabase.storage
        .from("assets")
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) {
        setError(`Falha ao enviar "${file.name}": ${uploadError.message}`);
        continue;
      }
      newAttachments.push({
        kind: kind as "image" | "pdf",
        storage_path: path,
        mime_type: file.type,
        filename: file.name,
      });
    }

    setStaged((prev) => [...prev, ...newAttachments]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = input.trim();
    if ((!msg && staged.length === 0) || pending || uploading) return;
    setInput("");
    const attachments = staged;
    setStaged([]);
    setError(null);
    startTransition(async () => {
      try {
        await sendCopyMessageAction(chatId, msg, attachments);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao enviar mensagem.");
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
        {initialMessages.map((m) => {
          // Assistente com copies demarcadas ([[COPY]]…): renderiza cada peça num cartão
          // com botão próprio, pra copiar uma de cada vez sem pegar comentário nem rótulo.
          if (m.role === "assistant") {
            const segments = parseCopySegments(m.content);
            if (segments.some((s) => s.type === "copy")) {
              return (
                <div key={m.id} className="mr-auto flex max-w-[92%] flex-col gap-2">
                  {segments.map((s, i) =>
                    s.type === "text" ? (
                      <div
                        key={i}
                        className="rounded-xl bg-line/40 px-3 py-2 text-sm leading-relaxed text-ink whitespace-pre-wrap"
                      >
                        {s.text}
                      </div>
                    ) : (
                      <div key={i} className="rounded-xl border border-emerald/40 bg-paper px-3 py-2">
                        <p className="text-sm leading-relaxed text-ink whitespace-pre-wrap">{s.text}</p>
                        <div className="mt-1.5 flex justify-end border-t border-line pt-1.5">
                          <CopyButton text={s.text} label="copiar esta" />
                        </div>
                      </div>
                    ),
                  )}
                </div>
              );
            }
          }

          return (
          <div key={m.id} className="flex flex-col">
            <div
              className={`rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap max-w-[92%] ${
                m.role === "user"
                  ? "ml-auto bg-emerald text-white"
                  : "mr-auto bg-line/40 text-ink"
              }`}
            >
              {m.content}
              {m.attachments && m.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.attachments.map((a, i) => {
                    const url = PUBLIC_BASE + a.storage_path;
                    if (a.kind === "image") {
                      return (
                        <a key={i} href={url} target="_blank" rel="noreferrer">
                          <img
                            src={url}
                            alt={a.filename}
                            className="max-h-40 rounded-lg border border-line object-cover"
                          />
                        </a>
                      );
                    }
                    return (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded-lg border border-line bg-paper px-2 py-1 text-xs text-ink hover:bg-line/30 transition"
                      >
                        📄 {a.filename}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
            {m.role === "assistant" && (
              <div className="mt-1">
                <CopyButton text={m.content} />
              </div>
            )}
          </div>
          );
        })}
        {pending && (
          <div className="mr-auto bg-line/40 text-ink2 rounded-xl px-3 py-2 text-sm font-mono animate-pulse">
            Pensando…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-3 border-t border-line">
        {error && <p className="text-xs text-risk mb-2">{error}</p>}

        {staged.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {staged.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-1 rounded-lg border border-line bg-paper px-2 py-1 text-xs text-ink"
              >
                {a.kind === "image" ? (
                  <img
                    src={PUBLIC_BASE + a.storage_path}
                    alt={a.filename}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <span>📄 {a.filename}</span>
                )}
                <button
                  type="button"
                  onClick={() => setStaged((prev) => prev.filter((_, idx) => idx !== i))}
                  className="ml-1 text-muted hover:text-risk transition"
                  aria-label="Remover"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            hidden
            accept="image/*,application/pdf"
            multiple
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFiles(e.target.files);
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending || uploading}
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-muted hover:text-ink hover:bg-line/30 transition disabled:opacity-50"
            title="Anexar imagem ou PDF"
          >
            {uploading ? "…" : "📎"}
          </button>
          <input
            className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-emerald placeholder:text-muted"
            placeholder="O que você quer gerar?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={pending}
          />
          <button
            type="submit"
            disabled={pending || uploading || (!input.trim() && staged.length === 0)}
            className="rounded-lg bg-emerald hover:bg-emeraldd transition text-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            →
          </button>
        </div>
      </form>
    </div>
  );
}
