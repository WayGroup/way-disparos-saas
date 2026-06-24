"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StandardLink } from "@/lib/db/types";
import { addLinkAction, updateLinkAction, removeLinkAction } from "../actions";

function LinkRow({ link }: { link: StandardLink }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(link.label);
  const [url, setUrl] = useState(link.url);
  const [description, setDescription] = useState(link.description);
  const [copied, setCopied] = useState(false);

  function save() {
    startTransition(async () => {
      await updateLinkAction(link.id, { label, url, description });
      setEditing(false);
      router.refresh();
    });
  }

  function copy() {
    if (!link.url) return;
    navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-emerald/40 bg-white p-4 space-y-3">
        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Nome</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
          <label className="block"><span className="text-[10px] font-mono uppercase text-muted">URL</span>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
        </div>
        <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Descrição</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
        <div className="flex gap-2">
          <button onClick={save} disabled={pending} className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50">{pending ? "Salvando…" : "Salvar"}</button>
          <button onClick={() => { setLabel(link.label); setUrl(link.url); setDescription(link.description); setEditing(false); }} className="rounded-lg border border-line text-sm px-3 py-1.5">Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-white p-4 flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="font-display font-bold">{link.label}</div>
        {link.description && <p className="text-xs text-muted mt-0.5">{link.description}</p>}
        {link.url ? (
          <a href={link.url} target="_blank" rel="noreferrer" className="font-mono text-xs text-emeraldd hover:underline break-all">{link.url}</a>
        ) : (
          <span className="font-mono text-xs text-risk">— sem link · clique em Editar para colar a URL</span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button onClick={copy} disabled={!link.url} className="text-xs text-ink2 font-medium hover:underline disabled:opacity-40">{copied ? "copiado ✓" : "copiar"}</button>
        <button onClick={() => setEditing(true)} className="text-xs text-emeraldd font-medium hover:underline">editar</button>
        <button
          onClick={() => { if (confirm(`Remover "${link.label}"?`)) startTransition(async () => { await removeLinkAction(link.id); router.refresh(); }); }}
          disabled={pending} className="text-xs text-muted hover:text-risk">remover</button>
      </div>
    </div>
  );
}

export function LinksManager({ links }: { links: StandardLink[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    if (!label.trim()) return;
    startTransition(async () => {
      await addLinkAction(label, url, description);
      setLabel(""); setUrl(""); setDescription("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {links.length === 0 ? (
        <p className="text-muted text-sm">Nenhum link ainda. Adicione o primeiro abaixo.</p>
      ) : (
        <div className="space-y-2">
          {links.map((l) => <LinkRow key={l.id} link={l} />)}
        </div>
      )}

      <div className="rounded-xl border border-dashed border-line bg-white p-4">
        <div className="font-mono text-xs uppercase tracking-wide text-muted mb-3">Novo link</div>
        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome (ex.: MZHUB)" className="rounded-lg border border-line p-2 text-sm" />
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="rounded-lg border border-line p-2 text-sm" />
        </div>
        <div className="flex gap-3 mt-3">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição (opcional)" className="flex-1 rounded-lg border border-line p-2 text-sm" />
          <button onClick={add} disabled={pending || !label.trim()} className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-4 py-2 disabled:opacity-50">Adicionar</button>
        </div>
      </div>
    </div>
  );
}
