"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignWithContent, ChatMessage, Asset, Community } from "@/lib/db/types";
import { approveAndScheduleAction, clearTrackAction } from "../../actions";
import type { ScheduleIssue } from "@/lib/sends/plan";
import { toPieces, type Piece } from "@/lib/campaign-pieces";
import { RefineChat } from "./refine-chat";
import { TouchCard } from "./touch-card";
import { PostCard } from "./post-card";
import { DuplicateButton } from "./duplicate-button";
import { PipelineView } from "./pipeline-view";
import { CalendarView } from "./calendar-view";
import { PieceDetailModal } from "./piece-detail-modal";
import { CampaignGroupsBar } from "./campaign-groups-bar";
import { NewGroupPostForm } from "./new-group-post-form";

type View = "lista" | "pipeline" | "calendario";

export function CampaignView({
  campaign,
  messages,
  assets,
  groups,
  anchor,
}: {
  campaign: CampaignWithContent;
  messages: ChatMessage[];
  assets: Asset[];
  groups: Community[];
  anchor: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("lista");
  const [track, setTrack] = useState<"api" | "grupos">("api");
  const [selected, setSelected] = useState<Piece | null>(null);
  const [approvePending, startApproveTransition] = useTransition();
  const [issues, setIssues] = useState<ScheduleIssue[]>([]);
  const [scheduled, setScheduled] = useState<number | null>(null);
  const [past, setPast] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [limpando, setLimpando] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [erroTrilha, setErroTrilha] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  // Muda a cada clique no botão "+ nova peça" do cabeçalho — inclusive quando `criando`
  // já é `true`. `criando` sozinho não reexecutaria o efeito de rolagem nesse caso, porque
  // `setCriando(true)` quando o valor já é `true` não é uma transição.
  const [criarPedido, setCriarPedido] = useState(0);
  const [pendingTrilha, startTrilha] = useTransition();

  const formularioRef = useRef<HTMLDivElement>(null);

  // Sem isto, clicar em "+ nova peça" no cabeçalho não produz efeito visível: o formulário
  // abre no fim de uma lista que, numa campanha real, tem uma dúzia de cartões.
  useEffect(() => {
    if (criando) {
      formularioRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [criando, criarPedido]);

  function approveAndSchedule() {
    setIssues([]);
    setScheduled(null);
    setPast([]);
    setError(null);
    startApproveTransition(async () => {
      try {
        const result = await approveAndScheduleAction(campaign.id);
        if (result.ok) {
          setScheduled(result.scheduled);
          // `?? []` de propósito: se um deploy trocar o formato da resposta enquanto a
          // aba está aberta, a tela não pode quebrar em cima de um campo que sumiu.
          setPast(result.past ?? []);
          router.refresh();
        } else {
          setIssues(result.issues ?? []);
        }
      } catch (e) {
        // Erro na tela, não tela de erro.
        setError(e instanceof Error ? e.message : "Falha ao aprovar. Recarregue e tente de novo.");
      }
    });
  }

  function limparTrilha() {
    setErroTrilha(null);
    startTrilha(async () => {
      try {
        await clearTrackAction(campaign.id, track);
        setLimpando(false);
        setConfirmacao("");
        router.refresh();
      } catch (e) {
        // Erro na tela, não tela de erro: o modal fica aberto, com a mensagem dentro dele,
        // para a pessoa cancelar ou tentar de novo com contexto — mesma convenção do
        // approveAndSchedule.
        setErroTrilha(e instanceof Error ? e.message : "Falha ao limpar a trilha. Tente de novo.");
      }
    });
  }

  const pieces = useMemo(() => toPieces(campaign, assets), [campaign, assets]);
  const filtered = pieces.filter((p) => p.track === track);

  return (
    <div className="h-[calc(100vh-var(--nav-height,56px))] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-paper/90 backdrop-blur border-b border-line px-8 py-4 flex items-center justify-between shrink-0">
        <div>
          <button onClick={() => router.push("/campanhas")} className="font-mono text-xs text-muted hover:text-ink">
            ← Campanhas
          </button>
          <h1 className="font-display font-bold text-2xl mt-0.5">{campaign.name}</h1>
          <div className="flex items-center gap-3 mt-1 font-mono text-xs text-muted">
            <span>{campaign.touches.length} toques</span>
            <span>·</span>
            <span>{campaign.group_posts.length} posts</span>
            <span>·</span>
            <span className={campaign.status === "aprovada" ? "text-emeraldd" : "text-risk"}>{campaign.status}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DuplicateButton campaignId={campaign.id} />
          <button
            onClick={approveAndSchedule}
            disabled={approvePending}
            title="Aprovar libera o envio automático nos grupos, no horário de cada peça."
            className="rounded-lg bg-emerald hover:bg-emeraldd transition text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {approvePending
              ? "Agendando…"
              : campaign.status === "aprovada"
                ? "Reagendar ↻"
                : "Aprovar e agendar"}
          </button>
        </div>
      </header>

      {(issues.length > 0 || scheduled !== null || error) && (
        <div className="px-8 pt-4 shrink-0">
          {error ? (
            <div className="rounded-xl border border-risk/30 bg-risk/5 p-4 text-sm text-risk">
              {error}
            </div>
          ) : issues.length > 0 ? (
            <div className="rounded-xl border border-risk/30 bg-risk/5 p-4">
              <p className="text-sm font-semibold text-risk">
                Nada foi agendado. Resolva antes de aprovar:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-ink2">
                {issues.map((issue, i) => (
                  <li key={i}>
                    <span className="font-mono text-xs">{issue.label}</span> — {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald/30 bg-emerald/5 p-4 text-sm text-emeraldd">
              <p>
                Campanha aprovada · {scheduled} envio(s) destravados, todos com hora à frente.{" "}
                <a href="/disparos" className="underline font-semibold">Ver em Disparos</a>
              </p>
              {past.length > 0 && (
                <p className="mt-2 text-risk">
                  <strong>{past.length} peça(s) não entraram na fila</strong> — a hora delas já
                  passou, e nada é agendado para trás: {past.join(", ")}. Para enviar mesmo assim,
                  duplique a campanha com uma data nova.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Controles: visão + filtro de trilha */}
      <div className="px-8 pt-5 pb-3 shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-line/40 rounded-lg p-1 w-fit">
          {(["lista", "pipeline", "calendario"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${view === v ? "bg-white shadow-sm" : "text-muted"}`}
            >
              {v === "lista" ? "Lista" : v === "pipeline" ? "Pipeline" : "Calendário"}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-line/40 rounded-lg p-1 w-fit">
          <button onClick={() => setTrack("api")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${track === "api" ? "bg-white shadow-sm" : "text-muted"}`}>
            API individual <span className="font-mono text-xs text-muted">· {campaign.touches.length}</span>
          </button>
          <button onClick={() => setTrack("grupos")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${track === "grupos" ? "bg-white shadow-sm" : "text-muted"}`}>
            Grupos <span className="font-mono text-xs text-muted">· {campaign.group_posts.length}</span>
          </button>
        </div>
        <button
          onClick={() => {
            setErroTrilha(null);
            setLimpando(true);
          }}
          className="font-mono text-xs text-muted hover:text-risk"
        >
          limpar trilha
        </button>
        {track === "grupos" && (
          <button
            onClick={() => {
              // O botão vive fora do ramo `view === "lista"`, mas o formulário só existe
              // lá dentro: sem trocar de visão, `setCriando(true)` rodaria com a tela em
              // Pipeline ou Calendário e não haveria nada para abrir nem para onde rolar.
              setView("lista");
              setCriando(true);
              setCriarPedido((n) => n + 1);
            }}
            className="font-mono text-xs text-muted hover:text-emeraldd"
          >
            + nova peça
          </button>
        )}
      </div>

      {/* Alvo da trilha Grupos: editor em massa. Só faz sentido nesta trilha. */}
      {track === "grupos" && (
        <div className="px-8 pb-3 shrink-0">
          <CampaignGroupsBar
            campaignId={campaign.id}
            posts={campaign.group_posts}
            groups={groups}
          />
        </div>
      )}

      {/* Conteúdo */}
      <div className="flex-1 min-h-0">
        {view === "lista" ? (
          <div className="h-full grid" style={{ gridTemplateColumns: "1fr 360px" }}>
            <div className="overflow-y-auto px-8 pb-8">
              {track === "api" ? (
                <div className="space-y-5 max-w-3xl">
                  {campaign.touches.map((t) => (
                    <TouchCard key={t.id} campaignId={campaign.id} touch={t} assets={assets} />
                  ))}
                </div>
              ) : (
                <div className="space-y-5 max-w-3xl">
                  {campaign.group_posts.map((p) => (
                    <PostCard key={p.id} campaignId={campaign.id} post={p} assets={assets} groups={groups} />
                  ))}
                  {criando ? (
                    <div ref={formularioRef}>
                      <NewGroupPostForm
                        campaignId={campaign.id}
                        anchor={anchor}
                        onClose={() => setCriando(false)}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setCriando(true)}
                      className="w-full rounded-xl border border-dashed border-line py-3 text-sm font-medium text-muted hover:border-emerald/40 hover:text-emeraldd"
                    >
                      + Nova peça à mão
                    </button>
                  )}
                </div>
              )}
            </div>
            <RefineChat campaignId={campaign.id} initialMessages={messages} />
          </div>
        ) : (
          <div className="h-full overflow-auto px-8 pb-8">
            {view === "pipeline" ? (
              <PipelineView pieces={filtered} onOpen={setSelected} />
            ) : (
              <CalendarView pieces={filtered} onOpen={setSelected} />
            )}
          </div>
        )}
      </div>

      {selected && (
        <PieceDetailModal
          piece={selected}
          touch={selected.track === "api" ? (campaign.touches.find((t) => t.sort_order === selected.sort_order) ?? null) : null}
          post={selected.track === "grupos" ? (campaign.group_posts.find((p) => p.sort_order === selected.sort_order) ?? null) : null}
          campaignId={campaign.id}
          assets={assets}
          groups={groups}
          onClose={() => setSelected(null)}
        />
      )}

      {limpando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-5">
            <h3 className="font-display font-bold text-lg">
              Limpar a trilha {track === "api" ? "API individual" : "Grupos"}?
            </h3>
            <p className="mt-2 text-sm text-ink2">
              Isso apaga as{" "}
              {track === "api" ? campaign.touches.length : campaign.group_posts.length} peça(s)
              desta trilha. Não tem desfazer.
              {/* Aviso incondicional: mesmo campanha em rascunho pode ter envios reais via
                  "Enviar agora" (forced: true), então o status aprovada/rascunho não é um
                  proxy confiável de "existem envios a perder". */}
              {track === "grupos" && (
                <> Os envios pendentes delas são cancelados, e o histórico do que já saiu some junto.</>
              )}
              {track === "api" && (
                <> Só o chat de refino recria peças desta trilha — não existe criar toque à mão.</>
              )}
            </p>
            <input
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              placeholder="Digite Limpar"
              className="mt-3 w-full rounded-lg border border-line p-2 text-sm"
            />
            {erroTrilha && (
              <p className="mt-3 rounded-lg border border-risk/30 bg-risk/5 p-3 text-sm text-risk">{erroTrilha}</p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  setLimpando(false);
                  setConfirmacao("");
                  setErroTrilha(null);
                }}
                className="rounded-lg border border-line px-3 py-1.5 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={limparTrilha}
                disabled={confirmacao.trim() !== "Limpar" || pendingTrilha}
                className="rounded-lg border border-risk bg-risk/10 px-3 py-1.5 text-sm font-semibold text-risk disabled:opacity-40"
              >
                {pendingTrilha ? "Limpando…" : "Limpar trilha"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
