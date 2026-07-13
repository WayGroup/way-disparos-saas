"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Community } from "@/lib/db/types";
import { matchCommunities } from "@/lib/sends/match";
import { setPostCommunitiesAction } from "../../actions";

export function GroupMultiSelect({
  campaignId,
  postId,
  selected,
  suggestion,
  groups,
}: {
  campaignId: string;
  postId: string;
  selected: string[];
  /** O texto livre que a IA escreveu. Vira pré-seleção quando nada foi escolhido ainda. */
  suggestion: string;
  groups: Community[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const suggested = useMemo(
    () =>
      matchCommunities(
        suggestion,
        groups.map((g) => ({
          id: g.id,
          name: g.name,
          identifier: g.identifier,
          wa_subject: g.wa_subject,
        })),
      ),
    [suggestion, groups],
  );

  // Sem seleção salva, parte da sugestão da IA — mas nada é gravado até o usuário confirmar.
  const [ids, setIds] = useState<string[]>(selected.length > 0 ? selected : suggested);
  const dirty = ids.length !== selected.length || ids.some((id) => !selected.includes(id));

  function toggle(id: string) {
    setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function save() {
    startTransition(async () => {
      await setPostCommunitiesAction(campaignId, postId, ids);
      router.refresh();
    });
  }

  if (groups.length === 0) {
    return (
      <p className="text-xs text-risk">
        Nenhum grupo sincronizado. Conecte o número em{" "}
        <a href="/whatsapp" className="underline">Conexão WhatsApp</a> antes de agendar.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase text-muted">Grupos do disparo</span>
        {selected.length === 0 && suggested.length > 0 && (
          <span className="text-[10px] font-mono text-muted">pré-marcado pela sugestão da IA</span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {groups.map((g) => {
          const on = ids.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggle(g.id)}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
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
      </div>

      {ids.length === 0 && (
        <p className="mt-1.5 text-xs text-risk">Sem grupo selecionado — esta peça não será enviada.</p>
      )}

      {dirty && (
        <button
          onClick={save}
          disabled={pending}
          className="mt-2 rounded-lg bg-emerald hover:bg-emeraldd text-white text-xs font-semibold px-2.5 py-1 disabled:opacity-50"
        >
          {pending ? "Salvando…" : `Salvar ${ids.length} grupo(s)`}
        </button>
      )}
    </div>
  );
}
