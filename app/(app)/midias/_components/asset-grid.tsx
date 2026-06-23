"use client";
import { useMemo, useState, useTransition } from "react";
import type { Asset } from "@/lib/db/types";
import { formatBytes } from "@/lib/assets/kind";
import { deleteAssetAction } from "../actions";

const PUBLIC_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/`;

const KIND_LABEL: Record<string, string> = {
  video: "vídeo", image: "imagem", audio: "áudio", pdf: "pdf", other: "arquivo",
};
const ICON: Record<string, string> = { video: "▶", image: "🖼", audio: "🔊", pdf: "📄", other: "📁" };

export function AssetGrid({ assets }: { assets: Asset[] }) {
  const [filter, setFilter] = useState<"all" | "video" | "image" | "audio">("all");
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    return assets.filter((a) => {
      const okKind = filter === "all" || a.kind === filter;
      const okQuery = a.filename.toLowerCase().includes(query.toLowerCase());
      return okKind && okQuery;
    });
  }, [assets, filter, query]);

  const tabs: { key: typeof filter; label: string }[] = [
    { key: "all", label: "Todas" }, { key: "video", label: "Vídeos" },
    { key: "image", label: "Imagens" }, { key: "audio", label: "Áudios" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-line/40 rounded-lg p-1">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${filter === t.key ? "bg-white shadow-sm" : "text-muted"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar mídia…"
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm w-64" />
        <span className="text-xs text-muted font-mono ml-auto">{visible.length} arquivo(s)</span>
      </div>

      {visible.length === 0 ? (
        <p className="text-muted text-sm">Nenhuma mídia ainda. Envie a primeira acima.</p>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {visible.map((a) => {
            const url = PUBLIC_BASE + a.storage_path;
            return (
              <div key={a.id} className="rounded-xl border border-line bg-white overflow-hidden">
                <div className="aspect-video bg-ink flex items-center justify-center text-paper text-3xl">{ICON[a.kind] ?? "📁"}</div>
                <div className="p-3">
                  <div className="font-mono text-sm truncate" title={a.filename}>{a.filename}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted font-mono">
                    <span className="rounded bg-paper border border-line px-1.5">{KIND_LABEL[a.kind] ?? a.kind}</span>
                    <span>{formatBytes(a.size_bytes)}</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <a href={url} target="_blank" rel="noreferrer" className="flex-1 text-center rounded-lg border border-line text-xs py-1.5 hover:bg-paper">Baixar</a>
                    <button onClick={() => navigator.clipboard.writeText(url)} className="flex-1 rounded-lg border border-line text-xs py-1.5 hover:bg-paper">Copiar link</button>
                  </div>
                  <button
                    onClick={() => { if (confirm(`Remover ${a.filename}?`)) startTransition(async () => { await deleteAssetAction(a.id, a.storage_path); }); }}
                    disabled={pending}
                    className="w-full mt-2 text-xs text-muted hover:text-risk">remover</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
