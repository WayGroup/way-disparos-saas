"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Asset } from "@/lib/db/types";
import { CopyButton } from "./copy-button";

function publicUrl(storagePath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${storagePath}`;
}

export function MediaPicker({ assets, currentId, onPick }: { assets: Asset[]; currentId: string | null; onPick: (assetId: string) => Promise<void> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = assets.find((a) => a.id === currentId) ?? null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <select
        value={currentId ?? ""}
        disabled={pending}
        onChange={(e) => startTransition(async () => { await onPick(e.target.value); router.refresh(); })}
        className="rounded-lg border border-line bg-white p-1.5 text-xs"
      >
        <option value="">— anexar mídia da biblioteca —</option>
        {assets.map((a) => <option key={a.id} value={a.id}>{a.filename}</option>)}
      </select>
      {current && (
        <>
          <a href={publicUrl(current.storage_path)} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-emeraldd underline truncate max-w-[200px]">{current.filename}</a>
          <CopyButton text={publicUrl(current.storage_path)} label="copiar link" />
        </>
      )}
    </div>
  );
}
