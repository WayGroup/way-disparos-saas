"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { buildStoragePath } from "@/lib/assets/storage-path";
import { registerAssetAction } from "../actions";

export function UploadZone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    const supabase = createBrowserSupabase();
    try {
      for (const file of Array.from(files)) {
        const seed = crypto.randomUUID().slice(0, 8);
        const path = buildStoragePath(file.name, seed);
        const { error: upErr } = await supabase.storage.from("assets").upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
        if (upErr) throw new Error(upErr.message);
        await registerAssetAction({
          filename: file.name,
          storagePath: path,
          mime: file.type || "application/octet-stream",
          size: file.size,
        });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no upload.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        className="block rounded-xl border-2 border-dashed border-line bg-white py-8 text-center cursor-pointer hover:border-emerald hover:bg-emerald/5 transition"
      >
        <div className="font-display font-semibold">{busy ? "Enviando..." : "Arraste arquivos aqui ou clique para enviar"}</div>
        <p className="text-sm text-muted mt-1">MP4, PNG, JPG, MP3, PDF · até 200MB por arquivo</p>
        <input ref={inputRef} type="file" className="hidden" multiple disabled={busy}
          onChange={(e) => handleFiles(e.target.files)} />
      </label>
      {error && <p className="text-sm text-risk mt-2">{error}</p>}
    </div>
  );
}
