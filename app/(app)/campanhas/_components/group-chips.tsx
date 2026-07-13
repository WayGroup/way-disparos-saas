"use client";
import { useState } from "react";
import type { Community } from "@/lib/db/types";

/**
 * Seletor de grupos. Controlado.
 *
 * A busca não é enfeite: contas reais têm centenas de grupos, e sem ela a lista vira
 * uma parede de chips. Os selecionados aparecem sempre, mesmo fora do filtro — senão
 * somem de vista e você perde a noção do que escolheu.
 */
export function GroupChips({
  groups,
  value,
  onChange,
  disabled = false,
}: {
  groups: Community[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const visible = groups.filter(
    (g) => value.includes(g.id) || !q || (g.wa_subject || g.name).toLowerCase().includes(q),
  );

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  if (groups.length === 0) return null;

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Buscar entre ${groups.length} grupos…`}
        disabled={disabled}
        className="w-full rounded-lg border border-line p-2 text-xs disabled:opacity-50"
      />

      <div className="mt-1.5 flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
        {visible.map((g) => {
          const on = value.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggle(g.id)}
              disabled={disabled}
              className={`rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
                on
                  ? "border-emerald bg-emerald/10 text-emeraldd font-semibold"
                  : "border-line text-muted hover:border-emerald/40"
              }`}
            >
              {on ? "✓ " : ""}
              {g.wa_subject || g.name}
            </button>
          );
        })}
        {visible.length === 0 && <p className="text-xs text-muted">Nenhum grupo com “{query}”.</p>}
      </div>
    </div>
  );
}
