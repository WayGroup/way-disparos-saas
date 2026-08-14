"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignGroupPost, Community } from "@/lib/db/types";
import { groupConsensus } from "@/lib/sends/group-consensus";
import { GroupChips } from "../../_components/group-chips";
import { GroupSummary, RESUMO_LIMITE } from "../../_components/group-summary";
import { setCampaignCommunitiesAction } from "../../actions";

export function CampaignGroupsBar({
  campaignId,
  posts,
  groups,
}: {
  campaignId: string;
  posts: CampaignGroupPost[];
  groups: Community[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [aberto, setAberto] = useState(false);

  const consensus = groupConsensus(posts);
  const [draft, setDraft] = useState<string[]>(consensus.uniform ? consensus.ids : []);

  const nameOf = (id: string) => {
    const g = groups.find((x) => x.id === id);
    return g ? g.wa_subject || g.name : "grupo removido";
  };

  function apply() {
    const n = posts.length;
    if (
      !confirm(
        `Aplicar estes ${draft.length} grupo(s) a ${n} peça(s)?\n\nIsso sobrescreve qualquer alvo customizado por peça.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      await setCampaignCommunitiesAction(campaignId, draft);
      setEditing(false);
      router.refresh();
    });
  }

  if (posts.length === 0) return null;

  if (editing) {
    return (
      <div className="rounded-xl border border-emerald/40 bg-white p-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-[10px] font-mono uppercase text-muted">
            Grupos de todas as {posts.length} peças
          </span>
          <div className="flex gap-2">
            <button
              onClick={apply}
              disabled={pending}
              className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
            >
              {pending ? "Aplicando…" : `Aplicar a ${posts.length} peça(s)`}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg border border-line text-xs px-3 py-1.5"
            >
              Cancelar
            </button>
          </div>
        </div>
        <GroupChips groups={groups} value={draft} onChange={setDraft} disabled={pending} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-white p-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <span className="text-[10px] font-mono uppercase text-muted">Grupos da campanha</span>

        {consensus.uniform ? (
          consensus.ids.length > 0 ? (
            <div className="mt-1.5">
              {/* Um caminho de renderização só: aberto é o mesmo resumo sem limite, dentro
                  de uma caixa com rolagem. Repetir a marcação do chip aqui faria os dois
                  estilos divergirem no primeiro ajuste visual. */}
              <div className={aberto ? "max-h-44 overflow-y-auto" : undefined}>
                <GroupSummary
                  names={consensus.ids.map(nameOf)}
                  limite={aberto ? consensus.ids.length : undefined}
                />
              </div>

              {consensus.ids.length > RESUMO_LIMITE && (
                <button
                  onClick={() => setAberto((a) => !a)}
                  aria-expanded={aberto}
                  className="mt-1.5 font-mono text-xs text-muted hover:text-ink"
                >
                  {aberto ? "▴ fechar" : `▾ ver todos os ${consensus.ids.length}`}
                </button>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm text-risk">
              Nenhum grupo selecionado — nenhuma peça desta campanha vai sair.
            </p>
          )
        ) : (
          <p className="mt-1 text-sm text-ink2">
            Os grupos <strong>variam por peça</strong> ({consensus.customized} customizada
            {consensus.customized > 1 ? "s" : ""}). Cada peça manda no próprio alvo.
          </p>
        )}
      </div>

      <button
        onClick={() => {
          setDraft(consensus.uniform ? consensus.ids : []);
          setEditing(true);
        }}
        className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold hover:bg-paper"
      >
        {consensus.uniform ? "Editar" : "Unificar"}
      </button>
    </div>
  );
}
