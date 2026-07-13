"use client";
import { useState, useTransition } from "react";
import type { Community } from "@/lib/db/types";
import { addCommunityAction, removeCommunityAction } from "../actions";

export function CommunitiesManager({ communities }: { communities: Community[] }) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <h2 className="font-display font-bold">Comunidades do funil</h2>
      <p className="text-sm text-muted mt-1">
        Usadas como alvo dos posts em grupo. Só as vinculadas a um grupo do WhatsApp podem receber
        disparo — escolha os grupos em <a href="/disparos" className="text-emerald underline">Disparos</a>.
      </p>
      <ul className="mt-3 space-y-2">
        {communities.map((c) => (
          <li key={c.id} className="flex items-center justify-between text-sm">
            <span>
              {c.name} <span className="font-mono text-xs text-muted">· {c.identifier}</span>
              {c.enabled ? (
                <span className="ml-2 rounded-full bg-emerald/10 text-emerald px-2 py-0.5 text-xs font-semibold">
                  em uso
                </span>
              ) : c.wa_group_id ? (
                <span className="ml-2 rounded-full bg-ink/8 text-muted px-2 py-0.5 text-xs font-semibold">
                  fora de uso
                </span>
              ) : (
                <span className="ml-2 rounded-full bg-risk/10 text-risk px-2 py-0.5 text-xs font-semibold">
                  sem grupo
                </span>
              )}
            </span>
            <button
              onClick={() => startTransition(async () => { await removeCommunityAction(c.id); })}
              disabled={pending}
              className="text-xs text-muted hover:text-risk"
            >remover</button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 mt-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nova comunidade"
          className="flex-1 rounded-lg border border-line p-2 text-sm"
        />
        <button
          onClick={() => startTransition(async () => { await addCommunityAction(name); setName(""); })}
          disabled={pending || !name.trim()}
          className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50"
        >Adicionar</button>
      </div>
    </div>
  );
}
