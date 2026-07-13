"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Asset, Community } from "@/lib/db/types";
import type { ScheduleIssue } from "@/lib/sends/plan";
import { publicAssetUrl } from "@/lib/campaign-pieces";
import { GroupChips } from "@/app/(app)/campanhas/_components/group-chips";
import { MediaPicker } from "@/app/(app)/campanhas/[id]/_components/media-picker";
import { WhatsappPreview } from "@/app/(app)/campanhas/[id]/_components/whatsapp-preview";
import { quickSendAction, type QuickSendResult } from "../actions";

/** O <input type="datetime-local"> devolve "YYYY-MM-DDTHH:mm"; a fila fala "YYYY-MM-DD HH:mm". */
function toSendAt(local: string): string {
  return local ? local.replace("T", " ").slice(0, 16) : "";
}

export function QuickSendPanel({
  groups,
  assets,
  paused,
  onClose,
}: {
  groups: Community[];
  assets: Asset[];
  paused: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [text, setText] = useState("");
  const [assetId, setAssetId] = useState<string | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"agora" | "agendar">("agora");
  const [when, setWhen] = useState("");

  const [issues, setIssues] = useState<ScheduleIssue[]>([]);
  const [result, setResult] = useState<QuickSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const asset = assets.find((a) => a.id === assetId) ?? null;
  const imageUrl = asset?.kind === "image" ? publicAssetUrl(asset.storage_path) : undefined;
  const canSend = ids.length > 0 && (text.trim() || assetId) && (mode === "agora" || when);

  function submit() {
    const alvo = ids.length === 1 ? "1 grupo" : `${ids.length} grupos`;
    const aviso =
      mode === "agora"
        ? `Enviar agora em ${alvo}?\n\nA mensagem sai de verdade e não tem desfazer.`
        : `Agendar este disparo para ${alvo}?`;
    if (!confirm(aviso)) return;

    setIssues([]);
    setResult(null);
    setError(null);

    startTransition(async () => {
      try {
        const res = await quickSendAction({
          text,
          assetId,
          communityIds: ids,
          sendAt: mode === "agora" ? "" : toSendAt(when),
        });
        if (res.ok) {
          setResult(res);
          setText("");
          setAssetId(null);
          setIds([]);
          setWhen("");
          router.refresh();
        } else {
          setIssues(res.issues);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Algo deu errado.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-paper shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper/95 px-5 py-3 backdrop-blur">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Mensagem avulsa · sem campanha
            </div>
            <h2 className="font-display text-lg font-bold">Disparo rápido</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-xl leading-none text-muted hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="space-y-4 p-5">
          {paused && (
            <p className="rounded-lg border border-risk/40 bg-risk/10 p-3 text-xs text-risk">
              Os envios estão pausados. O que sair daqui entra na fila e só é entregue quando
              alguém retomar.
            </p>
          )}

          {groups.length === 0 ? (
            <p className="text-sm text-muted">
              Nenhum grupo em uso. Escolha os grupos na faixa de conexão, acima.
            </p>
          ) : (
            <>
              <label className="block">
                <span className="font-mono text-[10px] uppercase text-muted">Mensagem</span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  placeholder="Escreva ou cole a mensagem…"
                  className="mt-1 w-full rounded-lg border border-line p-3 text-sm"
                />
              </label>

              <div>
                <span className="font-mono text-[10px] uppercase text-muted">Mídia (opcional)</span>
                <MediaPicker
                  assets={assets}
                  currentId={assetId}
                  onPick={async (id) => setAssetId(id || null)}
                />
              </div>

              <div>
                <span className="font-mono text-[10px] uppercase text-muted">
                  Grupos {ids.length > 0 && `· ${ids.length} selecionado(s)`}
                </span>
                <div className="mt-1.5">
                  <GroupChips groups={groups} value={ids} onChange={setIds} disabled={pending} />
                </div>
              </div>

              <div>
                <span className="font-mono text-[10px] uppercase text-muted">Quando</span>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <div className="flex gap-1 rounded-lg bg-line/40 p-1">
                    {(["agora", "agendar"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === m ? "bg-white shadow-sm" : "text-muted"}`}
                      >
                        {m === "agora" ? "Agora" : "Agendar"}
                      </button>
                    ))}
                  </div>
                  {mode === "agendar" && (
                    <input
                      type="datetime-local"
                      value={when}
                      onChange={(e) => setWhen(e.target.value)}
                      className="rounded-lg border border-line p-2 text-sm"
                    />
                  )}
                </div>
                {ids.length > 1 && mode === "agora" && (
                  <p className="mt-2 text-xs text-muted">
                    O primeiro grupo recebe em segundos; os demais saem espaçados de 20 a 60
                    segundos, para não queimar o número.
                  </p>
                )}
              </div>

              <div>
                <span className="font-mono text-[10px] uppercase text-muted">
                  Prévia no WhatsApp
                </span>
                <div className="mt-1.5">
                  <WhatsappPreview
                    message={text || "…"}
                    buttons={[]}
                    imageUrl={imageUrl}
                    time={mode === "agendar" && when ? when.slice(11, 16) : "agora"}
                  />
                </div>
              </div>

              {issues.length > 0 && (
                <ul className="rounded-lg border border-risk/30 bg-risk/5 p-3 text-sm text-risk">
                  {issues.map((issue, i) => (
                    <li key={i}>{issue.message}</li>
                  ))}
                </ul>
              )}

              {error && (
                <p className="rounded-lg border border-risk/30 bg-risk/5 p-3 text-sm text-risk">
                  {error}
                </p>
              )}

              {result?.ok && (
                <p className="rounded-lg border border-emerald/30 bg-emerald/5 p-3 text-sm text-emeraldd">
                  {result.immediate
                    ? `${result.sent} enviado(s)${result.failed > 0 ? `, ${result.failed} com falha` : ""}${result.queued > 0 ? `, ${result.queued} saindo nos próximos minutos` : ""}.`
                    : `${result.queued} envio(s) agendado(s).`}
                </p>
              )}
            </>
          )}
        </div>

        {groups.length > 0 && (
          <footer className="sticky bottom-0 mt-auto border-t border-line bg-paper/95 px-5 py-3 backdrop-blur">
            <button
              onClick={submit}
              disabled={pending || !canSend}
              className="w-full rounded-lg bg-emerald py-2.5 text-sm font-semibold text-white transition hover:bg-emeraldd disabled:opacity-50"
            >
              {pending
                ? "Disparando…"
                : mode === "agora"
                  ? `Enviar agora${ids.length > 0 ? ` em ${ids.length} grupo(s)` : ""}`
                  : "Agendar disparo"}
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}
