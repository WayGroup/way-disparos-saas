"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Asset } from "@/lib/db/types";
import { CopyButton } from "./copy-button";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { buildStoragePath } from "@/lib/assets/storage-path";
import { registerAssetAction } from "@/app/(app)/midias/actions";

function publicUrl(storagePath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${storagePath}`;
}

export function MediaPicker({
  assets,
  currentId,
  onPick,
  suggestion,
}: {
  assets: Asset[];
  currentId: string | null;
  onPick: (assetId: string) => Promise<void>;
  suggestion?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = assets.find((a) => a.id === currentId) ?? null;
  const busy = pending || uploading;

  async function handleUpload(file: File) {
    setError(null);
    if (file.size > 20 * 1024 * 1024) {
      setError(`"${file.name}" é grande demais (máx. 20MB).`);
      return;
    }
    setUploading(true);
    try {
      const path = buildStoragePath(file.name, crypto.randomUUID().slice(0, 8));
      const supabase = createBrowserSupabase();
      const { error: upErr } = await supabase.storage
        .from("assets")
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (upErr) throw new Error(upErr.message);
      const id = await registerAssetAction({
        filename: file.name,
        storagePath: path,
        mime: file.type || "application/octet-stream",
        size: file.size,
      });
      await onPick(id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao subir o arquivo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="mt-1">
      {suggestion && (
        <div className="mb-2 rounded-lg border border-line bg-paper px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1">Briefing da mídia</p>
          <p className="text-xs leading-relaxed whitespace-pre-wrap text-ink2">{suggestion}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={currentId ?? ""}
          disabled={busy}
          onChange={(e) => startTransition(async () => { await onPick(e.target.value); router.refresh(); })}
          className="rounded-lg border border-line bg-white p-1.5 text-xs disabled:opacity-50"
        >
          <option value="">— anexar mídia da biblioteca —</option>
          {assets.map((a) => <option key={a.id} value={a.id}>{a.filename}</option>)}
        </select>

        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-paper disabled:opacity-50"
        >
          {uploading ? "enviando…" : "📤 subir arquivo"}
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*,video/*,audio/*,application/pdf"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
        />

        {current && (
          <>
            <a href={publicUrl(current.storage_path)} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-emeraldd underline truncate max-w-[200px]">{current.filename}</a>
            <CopyButton text={publicUrl(current.storage_path)} label="copiar link" />
          </>
        )}
      </div>
      {error && <p className="text-[11px] text-risk mt-1">{error}</p>}
    </div>
  );
}
