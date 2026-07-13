"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Community } from "@/lib/db/types";
import { setGroupsEnabledAction } from "../actions";

type Filtro = "todos" | "usando" | "fora";

export function GroupPicker({ groups }: { groups: Community[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const enabledCount = groups.filter((g) => g.enabled).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (filtro === "usando" && !g.enabled) return false;
      if (filtro === "fora" && g.enabled) return false;
      if (!q) return true;
      return (g.wa_subject || g.name).toLowerCase().includes(q);
    });
  }, [groups, query, filtro]);

  function set(ids: string[], enabled: boolean) {
    startTransition(async () => {
      await setGroupsEnabledAction(ids, enabled);
      router.refresh();
    });
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-display font-bold">Nenhum grupo sincronizado</h2>
        <p className="text-sm text-muted mt-1">
          Conecte o número acima e clique em Sincronizar grupos.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display font-bold">Quais grupos a ferramenta pode usar</h2>
          <p className="text-sm text-muted mt-1">
            Sincronizar traz <strong>todos</strong> os grupos do número. Só os marcados aqui
            aparecem como alvo nas campanhas e no disparo rápido — os outros ficam de fora,
            fora de alcance.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display font-bold text-2xl text-emeraldd">{enabledCount}</div>
          <div className="font-mono text-[11px] text-muted">de {groups.length} em uso</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Buscar entre ${groups.length} grupos…`}
          className="flex-1 min-w-52 rounded-lg border border-line p-2 text-sm"
        />
        <div className="flex gap-1 bg-line/40 rounded-lg p-1">
          {(["todos", "usando", "fora"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                filtro === f ? "bg-white shadow-sm" : "text-muted"
              }`}
            >
              {f === "fora" ? "fora de uso" : f}
            </button>
          ))}
        </div>
      </div>

      {query.trim() && visible.length > 0 && (
        <div className="mt-2 flex gap-3 text-xs">
          <button
            onClick={() => set(visible.filter((g) => !g.enabled).map((g) => g.id), true)}
            disabled={pending}
            className="text-emeraldd font-medium hover:underline disabled:opacity-50"
          >
            usar os {visible.length} da busca
          </button>
          <button
            onClick={() => set(visible.filter((g) => g.enabled).map((g) => g.id), false)}
            disabled={pending}
            className="text-muted hover:text-risk disabled:opacity-50"
          >
            tirar os {visible.length} da busca
          </button>
        </div>
      )}

      <ul className="mt-3 divide-y divide-line max-h-[28rem] overflow-y-auto">
        {visible.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className={`text-sm truncate ${g.active ? "" : "text-muted line-through"}`}>
                {g.wa_subject || g.name}
              </p>
              <p className="font-mono text-[10px] text-muted truncate">{g.wa_group_id}</p>
            </div>
            <button
              onClick={() => set([g.id], !g.enabled)}
              disabled={pending || !g.active}
              title={!g.active ? "Este grupo sumiu do WhatsApp na última sincronização" : undefined}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-40 ${
                g.enabled
                  ? "border-emerald bg-emerald/10 text-emeraldd"
                  : "border-line text-muted hover:border-emerald/40"
              }`}
            >
              {g.enabled ? "✓ em uso" : "usar"}
            </button>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="py-3 text-sm text-muted">Nenhum grupo com esse filtro.</li>
        )}
      </ul>
    </div>
  );
}
