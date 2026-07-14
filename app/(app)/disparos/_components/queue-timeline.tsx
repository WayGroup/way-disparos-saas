"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SendWithContext } from "@/lib/db/sends";
import { displayStatus, DISPLAY_STATUSES, type DisplayStatus } from "@/lib/sends/status";
import { buildTimeline, countdown, timeLabel } from "@/lib/sends/timeline";
import { cancelSendAction, retrySendAction, unstickSendAction } from "../actions";

const STATUS_STYLE: Record<DisplayStatus, string> = {
  aguardando: "border-line bg-white text-muted",
  pendente: "border-emerald/40 bg-emerald/10 text-emeraldd",
  enviando: "border-risk/40 bg-risk/10 text-risk",
  enviado: "border-line bg-paper text-muted",
  falhou: "border-risk bg-risk/15 text-risk",
  expirado: "border-line bg-paper text-muted line-through",
  cancelado: "border-line bg-paper text-muted line-through",
};

const STATUS_LABEL: Record<DisplayStatus, string> = {
  aguardando: "aguardando aprovação",
  pendente: "vai sair",
  enviando: "enviando",
  enviado: "enviado",
  falhou: "falhou",
  expirado: "atrasado demais",
  cancelado: "cancelado",
};

/** Preso em `enviando` há mais de 10 min: a função morreu no meio. */
const STUCK_MS = 10 * 60 * 1000;

export function QueueTimeline({
  sends,
  counts,
  paused,
}: {
  sends: SendWithContext[];
  counts: Record<DisplayStatus, number>;
  paused: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filtro, setFiltro] = useState<DisplayStatus | null>(null);
  const nowLineRef = useRef<HTMLDivElement>(null);

  // O relógio do servidor e o do browser não são o mesmo; a divisória é do usuário.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const visible = useMemo(
    () => (filtro ? sends.filter((s) => displayStatus(s) === filtro) : sends),
    [sends, filtro],
  );
  const timeline = useMemo(() => buildTimeline(visible, now), [visible, now]);

  // Abre já na fronteira entre o que passou e o que vem — é onde a atenção mora.
  useEffect(() => {
    nowLineRef.current?.scrollIntoView({ block: "center" });
  }, [filtro]);

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const total = DISPLAY_STATUSES.reduce((sum, s) => sum + counts[s], 0);

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-1">
        <button
          onClick={() => setFiltro(null)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${!filtro ? "bg-white shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"}`}
        >
          Tudo <span className="font-mono text-xs text-muted">{total}</span>
        </button>
        {DISPLAY_STATUSES.filter((s) => counts[s] > 0).map((s) => (
          <button
            key={s}
            onClick={() => setFiltro(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filtro === s ? "bg-white shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"}`}
          >
            {STATUS_LABEL[s]} <span className="font-mono text-xs text-muted">{counts[s]}</span>
          </button>
        ))}
      </div>

      {timeline.days.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line p-10 text-center">
          <p className="font-display font-bold">Nada na fila</p>
          <p className="mt-1 text-sm text-muted">
            Aprove uma campanha ou use o disparo rápido. O que for agendado aparece aqui, na hora
            em que vai sair.
          </p>
        </div>
      ) : (
        <div className="mt-5">
          {timeline.days.map((day) => (
            <section key={day.key}>
              <h2 className="sticky top-0 z-10 bg-paper/90 py-2 font-mono text-xs uppercase tracking-widest text-muted backdrop-blur">
                {day.label}
              </h2>

              <ul>
                {day.sends.map((send) => {
                  const st = displayStatus(send);
                  const isNext = send.id === timeline.firstFutureId;
                  const stuck =
                    send.status === "enviando" &&
                    !!send.claimed_at &&
                    now.getTime() - new Date(send.claimed_at).getTime() > STUCK_MS;

                  return (
                    <li key={send.id}>
                      {/* A divisória do agora. Acima dela nada tem volta. */}
                      {isNext && (
                        <div ref={nowLineRef} className="flex items-center gap-3 py-3">
                          <span className="font-mono text-xs font-bold tracking-widest text-emerald">
                            AGORA
                          </span>
                          <span
                            className={`h-px flex-1 ${paused ? "bg-risk/40" : "bg-emerald/40"}`}
                          />
                          <span className="font-mono text-xs text-muted">
                            {paused
                              ? "pausado — nada cruza"
                              : timeline.nextAt
                                ? `próximo ${countdown(timeline.nextAt, now)}`
                                : ""}
                          </span>
                        </div>
                      )}

                      <div
                        className={`flex items-baseline gap-4 border-l-2 py-2.5 pl-4 ${
                          st === "aguardando" || st === "cancelado"
                            ? "border-line"
                            : st === "falhou"
                              ? "border-risk"
                              : "border-emerald/30"
                        }`}
                      >
                        <time className="w-11 shrink-0 font-mono text-sm tabular-nums">
                          {timeLabel(send.sent_at ?? send.scheduled_at)}
                        </time>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {send.wa_subject || send.wa_group_id}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {send.campaign_name ? (
                              <>
                                {send.campaign_name}
                                {send.post_role && ` · ${send.post_role}`}
                              </>
                            ) : (
                              <span className="font-mono">disparo avulso</span>
                            )}
                            {" — "}
                            {send.payload.text || "(só mídia)"}
                          </p>
                          {send.last_error && (
                            <p className="mt-0.5 truncate text-xs text-risk" title={send.last_error}>
                              {send.last_error}
                            </p>
                          )}
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[st]}`}
                        >
                          {STATUS_LABEL[st]}
                          {send.attempts > 1 && (
                            <span className="ml-1 font-mono">· {send.attempts}ª</span>
                          )}
                        </span>

                        <span className="w-16 shrink-0 text-right">
                          {st === "pendente" && (
                            <button
                              onClick={() => run(() => cancelSendAction(send.id))}
                              disabled={pending}
                              className="text-xs text-muted hover:text-risk disabled:opacity-50"
                            >
                              cancelar
                            </button>
                          )}
                          {(st === "falhou" || st === "cancelado" || st === "expirado") && (
                            <button
                              onClick={() => run(() => retrySendAction(send.id))}
                              disabled={pending}
                              className="text-xs font-semibold text-emeraldd hover:underline disabled:opacity-50"
                            >
                              reenviar
                            </button>
                          )}
                          {stuck && (
                            <button
                              onClick={() => {
                                if (
                                  confirm(
                                    "Este envio ficou preso. A mensagem PODE já ter saído — confira o grupo antes de reenviar.\n\nMarcar como falha?",
                                  )
                                ) {
                                  run(() => unstickSendAction(send.id));
                                }
                              }}
                              disabled={pending}
                              className="text-xs font-semibold text-risk hover:underline disabled:opacity-50"
                            >
                              destravar
                            </button>
                          )}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {/* Fila inteira no passado: a divisória vai no fim. */}
          {timeline.firstFutureId === null && (
            <div className="flex items-center gap-3 py-3">
              <span className="font-mono text-xs font-bold tracking-widest text-muted">AGORA</span>
              <span className="h-px flex-1 bg-line" />
              <span className="font-mono text-xs text-muted">nada agendado à frente</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
