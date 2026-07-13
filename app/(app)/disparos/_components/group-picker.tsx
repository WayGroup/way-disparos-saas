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

  const enabled = groups.filter((g) => g.enabled).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (filtro === "usando" && !g.enabled) return false;
      if (filtro === "fora" && g.enabled) return false;
      if (!q) return true;
      return (g.wa_subject || g.name).toLowerCase().includes(q);
    });
  }, [groups, query, filtro]);

  function set(ids: string[], enable: boolean) {
    startTransition(async () => {
      await setGroupsEnabledAction(ids, enable);
      router.refresh();
    });
  }

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nenhum grupo sincronizado ainda. Conecte o número e sincronize.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-display font-bold">Quais grupos a ferramenta pode usar</h3>
          <p className="mt-0.5 text-sm text-muted">
            Sincronizar traz todos os grupos do número. Só os marcados aqui podem ser alvo de
            campanha ou disparo — os outros ficam fora de alcance.
          </p>
        </div>
        <span className="font-mono text-xs text-muted">
          <strong className="text-emeraldd">{enabled}</strong> de {groups.length}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Buscar entre ${groups.length} grupos…`}
          className="min-w-52 flex-1 rounded-lg border border-line p-2 text-sm"
        />
        <div className="flex gap-1 rounded-lg bg-line/40 p-1">
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
        <div className="mt-2 flex gap-4 font-mono text-xs">
          <button
            onClick={() => set(visible.filter((g) => !g.enabled).map((g) => g.id), true)}
            disabled={pending}
            className="font-semibold text-emeraldd hover:underline disabled:opacity-50"
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

      <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
        {visible.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className={`truncate text-sm ${g.active ? "" : "text-muted line-through"}`}>
                {g.wa_subject || g.name}
              </p>
              <p className="truncate font-mono text-[10px] text-muted">{g.wa_group_id}</p>
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
          <li className="px-3 py-3 text-sm text-muted">Nenhum grupo com esse filtro.</li>
        )}
      </ul>
    </div>
  );
}
