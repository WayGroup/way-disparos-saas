"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SendStatus } from "@/lib/db/types";
import type { SendWithContext } from "@/lib/db/sends";
import { cancelSendAction, retrySendAction, unstickSendAction } from "../actions";

const STATUS_STYLE: Record<SendStatus, string> = {
  pendente: "bg-ink/8 text-ink2",
  enviando: "bg-amber-100 text-amber-700",
  enviado: "bg-emerald/10 text-emeraldd",
  falhou: "bg-risk/15 text-risk",
  cancelado: "bg-ink/5 text-muted",
};

const ORDER: SendStatus[] = ["pendente", "enviando", "enviado", "falhou", "cancelado"];

/** Uma linha em 'enviando' há mais de 10 min está presa: a função morreu no meio. */
const STUCK_MS = 10 * 60 * 1000;

function formatInstant(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SendsTable({
  sends,
  counts,
  activeStatus,
}: {
  sends: SendWithContext[];
  counts: Record<SendStatus, number>;
  activeStatus?: SendStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const total = ORDER.reduce((sum, s) => sum + counts[s], 0);

  return (
    <div>
      <div className="flex flex-wrap gap-1 bg-line/40 rounded-lg p-1 w-fit">
        <a
          href="/envios"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${!activeStatus ? "bg-white shadow-sm" : "text-muted"}`}
        >
          Todos <span className="font-mono text-xs text-muted">· {total}</span>
        </a>
        {ORDER.map((s) => (
          <a
            key={s}
            href={`/envios?status=${s}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${activeStatus === s ? "bg-white shadow-sm" : "text-muted"}`}
          >
            {s} <span className="font-mono text-xs text-muted">· {counts[s]}</span>
          </a>
        ))}
      </div>

      {sends.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          Nenhum envio {activeStatus ? `com status "${activeStatus}"` : "ainda"}. Aprove uma
          campanha ou use o Disparo rápido.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left">
              <tr className="font-mono text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-3 font-medium">Quando</th>
                <th className="px-4 py-3 font-medium">Grupo</th>
                <th className="px-4 py-3 font-medium">Origem</th>
                <th className="px-4 py-3 font-medium">Mensagem</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sends.map((s) => {
                const stuck =
                  s.status === "enviando" &&
                  !!s.claimed_at &&
                  Date.now() - new Date(s.claimed_at).getTime() > STUCK_MS;

                return (
                  <tr key={s.id} className="align-top">
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                      {formatInstant(s.sent_at ?? s.scheduled_at)}
                    </td>
                    <td className="px-4 py-3">{s.wa_subject || s.wa_group_id}</td>
                    <td className="px-4 py-3 text-muted">
                      {s.campaign_name ? (
                        <>
                          {s.campaign_name}
                          {s.post_role && <span className="text-xs"> · {s.post_role}</span>}
                        </>
                      ) : (
                        <span className="font-mono text-xs">avulso</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="truncate text-muted">{s.payload.text || "(só mídia)"}</p>
                      {s.last_error && (
                        <p className="mt-1 text-xs text-risk truncate" title={s.last_error}>
                          {s.last_error}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[s.status]}`}>
                        {s.status}
                      </span>
                      {s.attempts > 1 && (
                        <span className="ml-1.5 font-mono text-[11px] text-muted">{s.attempts}ª</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {s.status === "pendente" && (
                        <button
                          onClick={() => run(() => cancelSendAction(s.id))}
                          disabled={pending}
                          className="text-xs text-muted hover:text-risk disabled:opacity-50"
                        >
                          cancelar
                        </button>
                      )}
                      {(s.status === "falhou" || s.status === "cancelado") && (
                        <button
                          onClick={() => run(() => retrySendAction(s.id))}
                          disabled={pending}
                          className="text-xs text-emeraldd hover:underline disabled:opacity-50"
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
                              run(() => unstickSendAction(s.id));
                            }
                          }}
                          disabled={pending}
                          className="text-xs text-risk hover:underline disabled:opacity-50"
                        >
                          destravar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
