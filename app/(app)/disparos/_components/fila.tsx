"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SendWithContext } from "@/lib/db/sends";
import { displayStatus } from "@/lib/sends/status";
import { partitionQueue, isStuck } from "@/lib/sends/queue-groups";
import { buildTimeline, countdown, timeLabel } from "@/lib/sends/timeline";
import { cancelSendAction, retrySendAction, dismissSendAction, unstickSendAction } from "../actions";
import { StatusBadge } from "./send-status";

export function Fila({ sends, paused }: { sends: SendWithContext[]; paused: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const nowLineRef = useRef<HTMLDivElement>(null);

  // O relógio do servidor e o do browser não são o mesmo; a divisória é do usuário.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { attention, upcoming } = useMemo(() => partitionQueue(sends, now), [sends, now]);
  const timeline = useMemo(() => buildTimeline(upcoming, now), [upcoming, now]);

  useEffect(() => {
    nowLineRef.current?.scrollIntoView({ block: "center" });
  }, []);

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  if (sends.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-line p-10 text-center">
        <p className="font-display font-bold">Fila vazia</p>
        <p className="mt-1 text-sm text-muted">
          Nada para sair agora. Aprove uma campanha ou use o disparo rápido — o que for agendado
          aparece aqui, na hora em que vai sair.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Precisam de atenção — passado, mas pede decisão. Fica acima da cronologia. */}
      {attention.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-risk">
            Precisam de atenção
            <span className="rounded-full bg-risk/15 px-1.5 text-[11px]">{attention.length}</span>
          </h2>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-risk/30 bg-risk/[0.03]">
            {attention.map((send) => {
              const st = displayStatus(send);
              const stuck = isStuck(send, now);
              return (
                <li key={send.id} className="flex items-baseline gap-4 px-4 py-2.5">
                  <time className="w-11 shrink-0 font-mono text-sm tabular-nums text-muted">
                    {timeLabel(send.scheduled_at)}
                  </time>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {send.wa_subject || send.wa_group_id}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {send.campaign_name ?? "disparo avulso"}
                      {send.post_role && ` · ${send.post_role}`} — {send.payload.text || "(só mídia)"}
                    </p>
                    {send.last_error && (
                      <p className="mt-0.5 truncate text-xs text-risk" title={send.last_error}>
                        {send.last_error}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={stuck ? "enviando" : st} attempts={send.attempts} />
                  <span className="flex shrink-0 gap-3 text-xs">
                    {stuck ? (
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
                        className="font-semibold text-risk hover:underline disabled:opacity-50"
                      >
                        destravar
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => run(() => retrySendAction(send.id))}
                          disabled={pending}
                          className="font-semibold text-emeraldd hover:underline disabled:opacity-50"
                        >
                          reenviar
                        </button>
                        <button
                          onClick={() => run(() => dismissSendAction(send.id))}
                          disabled={pending}
                          className="text-muted hover:text-risk disabled:opacity-50"
                        >
                          dispensar
                        </button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Próximos — a linha do tempo, com a divisória do AGORA. */}
      {timeline.days.length > 0 && (
        <section>
          {timeline.days.map((day) => (
            <div key={day.key}>
              <h2 className="sticky top-0 z-10 bg-paper/90 py-2 font-mono text-xs uppercase tracking-widest text-muted backdrop-blur">
                {day.label}
              </h2>
              <ul>
                {day.sends.map((send) => {
                  const st = displayStatus(send);
                  const isNext = send.id === timeline.firstFutureId;
                  return (
                    <li key={send.id}>
                      {isNext && (
                        <div ref={nowLineRef} className="flex items-center gap-3 py-3">
                          <span className="font-mono text-xs font-bold tracking-widest text-emerald">
                            AGORA
                          </span>
                          <span className={`h-px flex-1 ${paused ? "bg-risk/40" : "bg-emerald/40"}`} />
                          <span className="font-mono text-xs text-muted">
                            {paused
                              ? "pausado — nada cruza"
                              : timeline.nextAt
                                ? `próximo ${countdown(timeline.nextAt, now)}`
                                : ""}
                          </span>
                        </div>
                      )}
                      <div className="flex items-baseline gap-4 border-l-2 border-emerald/30 py-2.5 pl-4">
                        <time className="w-11 shrink-0 font-mono text-sm tabular-nums">
                          {timeLabel(send.scheduled_at)}
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
                            )}{" "}
                            — {send.payload.text || "(só mídia)"}
                          </p>
                        </div>
                        <StatusBadge status={st} attempts={send.attempts} />
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
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
