"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { duplicateCampaignAction } from "../../actions";

export function DuplicateButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState("");
  const [pending, startTransition] = useTransition();
  if (!open) {
    return <button onClick={() => setOpen(true)} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-paper">Duplicar</button>;
  }
  return (
    <div className="flex items-center gap-2">
      <input type="datetime-local" value={anchor} onChange={(e) => setAnchor(e.target.value)} className="rounded-lg border border-line p-1.5 text-sm" />
      <button disabled={pending} onClick={() => startTransition(async () => { const id = await duplicateCampaignAction(campaignId, anchor, ""); router.push(`/campanhas/${id}`); })} className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50">{pending ? "Duplicando…" : "Duplicar nesta data"}</button>
      <button onClick={() => setOpen(false)} className="text-sm text-muted">cancelar</button>
    </div>
  );
}
