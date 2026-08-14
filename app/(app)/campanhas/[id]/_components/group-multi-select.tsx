"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Community } from "@/lib/db/types";
import { matchCommunities } from "@/lib/sends/match";
import { GroupChips } from "../../_components/group-chips";
import { GroupSummary } from "../../_components/group-summary";
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

  // Sem seleção salva, parte da sugestão da IA — mas nada é gravado até confirmar.
  const [ids, setIds] = useState<string[]>(selected.length > 0 ? selected : suggested);

  // Peça sem grupo nenhum nasce ABERTA e não oferece botão de fechar: é um erro que
  // impede a peça de sair, e escondê-lo atrás de um clique trocaria um problema visual
  // por um de disparo. O valor inicial é calculado uma vez, então escolher grupos depois
  // não fecha o seletor no meio da interação.
  const [aberto, setAberto] = useState(ids.length === 0);

  const nomeDe = (id: string) => {
    const g = groups.find((x) => x.id === id);
    return g ? g.wa_subject || g.name : "grupo removido";
  };

  const dirty = ids.length !== selected.length || ids.some((id) => !selected.includes(id));

  function save() {
    startTransition(async () => {
      await setPostCommunitiesAction(campaignId, postId, ids);
      router.refresh();
    });
  }

  if (groups.length === 0) {
    return (
      <p className="text-xs text-risk">
        Nenhum grupo habilitado. Escolha quais grupos a ferramenta pode usar em{" "}
        <a href="/disparos" className="underline">Disparos</a>.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase text-muted">Grupos desta peça</span>
        {selected.length === 0 && suggested.length > 0 && (
          <span className="text-[10px] font-mono text-muted">pré-marcado pela sugestão da IA</span>
        )}
      </div>

      <div className="mt-1.5">
        {aberto ? (
          <GroupChips groups={groups} value={ids} onChange={setIds} disabled={pending} />
        ) : (
          <GroupSummary names={ids.map(nomeDe)} />
        )}
      </div>

      {ids.length > 0 && (
        <button
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          className="mt-1.5 font-mono text-xs text-muted hover:text-ink"
        >
          {aberto ? "▴ fechar" : `▾ alterar os ${ids.length} grupos`}
        </button>
      )}

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
