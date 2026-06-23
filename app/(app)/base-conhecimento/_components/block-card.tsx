"use client";
import { useState, useTransition } from "react";
import type { BrandBlock } from "@/lib/db/types";
import { updateBlockAction } from "../actions";

const RESTRICTION_KEYS = ["restricoes"];

export function BlockCard({ block }: { block: BrandBlock }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(block.content);
  const [pending, startTransition] = useTransition();
  const isRestriction = RESTRICTION_KEYS.includes(block.block_key);

  function save() {
    startTransition(async () => {
      await updateBlockAction(block.block_key, value);
      setEditing(false);
    });
  }

  return (
    <div className={`rounded-xl border bg-white p-5 ${isRestriction ? "border-risk/40 bg-risk/5" : "border-line"}`}>
      <div className="flex items-center justify-between">
        <h2 className={`font-display font-bold ${isRestriction ? "text-risk" : ""}`}>{block.title}</h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-emeraldd hover:underline">Editar</button>
        )}
      </div>
      {editing ? (
        <div className="mt-2">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-line p-2 text-sm"
          />
          <div className="flex gap-2 mt-2">
            <button onClick={save} disabled={pending} className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50">
              {pending ? "Salvando..." : "Salvar"}
            </button>
            <button onClick={() => { setValue(block.content); setEditing(false); }} className="rounded-lg border border-line text-sm px-3 py-1.5">Cancelar</button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink2 mt-2 leading-relaxed whitespace-pre-wrap">{block.content}</p>
      )}
    </div>
  );
}
