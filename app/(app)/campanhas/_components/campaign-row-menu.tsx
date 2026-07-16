"use client";
import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renameCampaignAction, deleteCampaignAction, duplicateCampaignAction } from "../actions";

type Mode = null | "rename" | "duplicate" | "delete";

export function CampaignRowMenu({ campaignId, name }: { campaignId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [renameValue, setRenameValue] = useState(name);
  const [dupAnchor, setDupAnchor] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function closeModal() {
    setMode(null);
    setDeleteConfirm("");
  }

  function openMode(m: Mode) {
    setOpen(false);
    if (m === "rename") setRenameValue(name);
    if (m === "duplicate") setDupAnchor("");
    if (m === "delete") setDeleteConfirm("");
    setMode(m);
  }

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Ações da campanha"
        className="rounded-lg px-2 py-1 text-muted hover:bg-paper hover:text-ink"
      >
        ⋯
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-line bg-white py-1 shadow-lg">
          <button role="menuitem" onClick={() => openMode("rename")} className="block w-full px-3 py-2 text-left text-sm hover:bg-paper">Renomear</button>
          <button role="menuitem" onClick={() => openMode("duplicate")} className="block w-full px-3 py-2 text-left text-sm hover:bg-paper">Duplicar</button>
          <button role="menuitem" onClick={() => openMode("delete")} className="block w-full px-3 py-2 text-left text-sm text-risk hover:bg-paper">Excluir</button>
        </div>
      )}

      {mode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={closeModal}>
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-xl text-left" onClick={(e) => e.stopPropagation()}>
            {mode === "rename" && (
              <>
                <h3 className="font-display font-bold text-lg mb-3">Renomear campanha</h3>
                <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus className="w-full rounded-lg border border-line p-2 text-sm" />
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={closeModal} className="rounded-lg border border-line px-3 py-1.5 text-sm">Cancelar</button>
                  <button
                    disabled={pending || !renameValue.trim()}
                    onClick={() => startTransition(async () => { await renameCampaignAction(campaignId, renameValue); closeModal(); router.refresh(); })}
                    className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50"
                  >
                    {pending ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              </>
            )}

            {mode === "duplicate" && (
              <>
                <h3 className="font-display font-bold text-lg mb-1">Duplicar campanha</h3>
                <p className="text-sm text-muted mb-3">Escolha a nova data-âncora da cópia.</p>
                <input type="datetime-local" value={dupAnchor} onChange={(e) => setDupAnchor(e.target.value)} autoFocus className="w-full rounded-lg border border-line p-2 text-sm" />
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={closeModal} className="rounded-lg border border-line px-3 py-1.5 text-sm">Cancelar</button>
                  <button
                    disabled={pending || !dupAnchor}
                    onClick={() => startTransition(async () => { const id = await duplicateCampaignAction(campaignId, dupAnchor, ""); router.push(`/campanhas/${id}`); })}
                    className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50"
                  >
                    {pending ? "Duplicando…" : "Duplicar nesta data"}
                  </button>
                </div>
              </>
            )}

            {mode === "delete" && (
              <>
                <h3 className="font-display font-bold text-lg mb-1 text-risk">Excluir campanha</h3>
                <p className="text-sm text-ink2 mb-3">Você vai excluir <b>{name}</b>. Isso apaga a campanha e todos os envios já agendados dela — os pendentes são cancelados e o histórico de enviados some. <b>Não tem desfazer.</b></p>
                <label className="block text-sm text-muted mb-1">Digite <span className="font-mono text-ink">Delete</span> para confirmar:</label>
                <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} autoFocus className="w-full rounded-lg border border-line p-2 text-sm" />
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={closeModal} className="rounded-lg border border-line px-3 py-1.5 text-sm">Cancelar</button>
                  <button
                    disabled={pending || deleteConfirm.trim() !== "Delete"}
                    onClick={() => startTransition(async () => { await deleteCampaignAction(campaignId); closeModal(); router.refresh(); })}
                    className="rounded-lg bg-risk hover:opacity-90 text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50"
                  >
                    {pending ? "Excluindo…" : "Excluir definitivamente"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
