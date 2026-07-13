"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Asset, Community } from "@/lib/db/types";
import type { ScheduleIssue } from "@/lib/sends/plan";
import { publicAssetUrl } from "@/lib/campaign-pieces";
import { MediaPicker } from "@/app/(app)/campanhas/[id]/_components/media-picker";
import { WhatsappPreview } from "@/app/(app)/campanhas/[id]/_components/whatsapp-preview";
import { quickSendAction, type QuickSendResult } from "../actions";

/** O <input type="datetime-local"> devolve "YYYY-MM-DDTHH:mm"; a fila fala "YYYY-MM-DD HH:mm". */
function toSendAt(local: string): string {
  return local ? local.replace("T", " ").slice(0, 16) : "";
}

export function QuickSendForm({ groups, assets }: { groups: Community[]; assets: Asset[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [text, setText] = useState("");
  const [assetId, setAssetId] = useState<string | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"agora" | "agendar">("agora");
  const [when, setWhen] = useState("");
  const [query, setQuery] = useState("");

  const [issues, setIssues] = useState<ScheduleIssue[]>([]);
  const [result, setResult] = useState<QuickSendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const asset = assets.find((a) => a.id === assetId) ?? null;
  const imageUrl = asset?.kind === "image" ? publicAssetUrl(asset.storage_path) : undefined;

  function toggle(id: string) {
    setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function submit() {
    const alvo = ids.length === 1 ? "1 grupo" : `${ids.length} grupos`;
    const aviso =
      mode === "agora"
        ? `Enviar AGORA em ${alvo}?\n\nIsso é real e não tem desfazer.`
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

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-display font-bold">Nenhum grupo sincronizado</h2>
        <p className="text-sm text-muted mt-1">
          Conecte o número e puxe os grupos em{" "}
          <a href="/whatsapp" className="text-emerald underline">Conexão WhatsApp</a>.
        </p>
      </div>
    );
  }

  const canSend = ids.length > 0 && (text.trim() || assetId) && (mode === "agora" || when);

  const q = query.trim().toLowerCase();
  const visible = groups.filter(
    (g) => ids.includes(g.id) || !q || (g.wa_subject || g.name).toLowerCase().includes(q),
  );

  return (
    <div className="grid gap-5 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-xl border border-line bg-white p-5 space-y-4">
        <label className="block">
          <span className="text-[10px] font-mono uppercase text-muted">Mensagem</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Escreva ou cole a mensagem…"
            className="mt-1 w-full rounded-lg border border-line p-3 text-sm"
          />
        </label>

        <div>
          <span className="text-[10px] font-mono uppercase text-muted">Mídia (opcional)</span>
          <MediaPicker
            assets={assets}
            currentId={assetId}
            onPick={async (id) => setAssetId(id || null)}
          />
        </div>

        <div>
          <span className="text-[10px] font-mono uppercase text-muted">
            Grupos {ids.length > 0 && `· ${ids.length} selecionado(s)`}
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Buscar entre ${groups.length} grupos…`}
            className="mt-1.5 w-full rounded-lg border border-line p-2 text-xs"
          />
          {/* Selecionados aparecem sempre, mesmo fora da busca — senão somem de vista. */}
          <div className="mt-1.5 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
            {visible.map((g) => {
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
            {visible.length === 0 && (
              <p className="text-xs text-muted">Nenhum grupo com “{query}”.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex gap-1 bg-line/40 rounded-lg p-1">
            {(["agora", "agendar"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === m ? "bg-white shadow-sm" : "text-muted"}`}
              >
                {m === "agora" ? "Enviar agora" : "Agendar"}
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

          <button
            onClick={submit}
            disabled={pending || !canSend}
            className="ml-auto rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-4 py-2 disabled:opacity-50"
          >
            {pending ? "Disparando…" : mode === "agora" ? "Disparar agora" : "Agendar disparo"}
          </button>
        </div>

        {ids.length > 1 && mode === "agora" && (
          <p className="text-xs text-muted">
            O primeiro grupo recebe em segundos; os demais saem espaçados de 20 a 60 segundos,
            para não queimar o número.
          </p>
        )}

        {issues.length > 0 && (
          <div className="rounded-lg border border-risk/30 bg-risk/5 p-3">
            <ul className="text-sm text-risk space-y-0.5">
              {issues.map((issue, i) => (
                <li key={i}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-risk/30 bg-risk/5 p-3 text-sm text-risk">{error}</div>
        )}

        {result?.ok && (
          <div className="rounded-lg border border-emerald/30 bg-emerald/5 p-3 text-sm text-emeraldd">
            {result.immediate
              ? `${result.sent} enviado(s)${result.failed > 0 ? `, ${result.failed} com falha` : ""}${result.queued > 0 ? `, ${result.queued} saindo nos próximos minutos` : ""}.`
              : `${result.queued} envio(s) agendado(s).`}{" "}
            <a href="/envios" className="underline font-semibold">Ver em Envios</a>
          </div>
        )}
      </div>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2">
          Prévia no WhatsApp
        </div>
        <div className="lg:sticky lg:top-4">
          <WhatsappPreview
            message={text || "…"}
            buttons={[]}
            imageUrl={imageUrl}
            time={mode === "agendar" && when ? when.slice(11, 16) : "agora"}
          />
        </div>
      </div>
    </div>
  );
}
