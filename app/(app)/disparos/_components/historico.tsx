"use client";
import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { HistoryPage, SendCampaign } from "@/lib/db/sends";
import type { SendStatus } from "@/lib/db/types";
import { displayStatus } from "@/lib/sends/status";
import { shortStamp } from "@/lib/sends/timeline";
import { retrySendAction } from "../actions";
import { StatusBadge } from "./send-status";

const STATUS_TABS: { value: "" | SendStatus; label: string }[] = [
  { value: "", label: "Tudo" },
  { value: "enviado", label: "Enviados" },
  { value: "cancelado", label: "Cancelados" },
];

export function Historico({
  data,
  campaigns,
  campaignId,
  status,
}: {
  data: HistoryPage;
  campaigns: SendCampaign[];
  campaignId: string;
  status: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  // Toda navegação mantém o modo (view=historico) e reseta a página, exceto ao paginar.
  function go(patch: Record<string, string | null>, keepPage = false) {
    const next = new URLSearchParams(params.toString());
    next.set("view", "historico");
    if (!keepPage) next.delete("pagina");
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  function retry(id: string) {
    startTransition(async () => {
      await retrySendAction(id);
      router.refresh();
    });
  }

  return (
    <div>
      {/* Filtros do livro-caixa */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={campaignId}
          onChange={(e) => go({ campanha: e.target.value || null })}
          className="rounded-lg border border-line bg-white p-2 text-sm"
        >
          <option value="">Todas as campanhas</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <div className="flex gap-1 rounded-lg bg-line/40 p-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => go({ status: t.value || null })}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                status === t.value ? "bg-white shadow-sm" : "text-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <span className="ml-auto font-mono text-xs text-muted">
          {data.total} registro{data.total === 1 ? "" : "s"}
        </span>
      </div>

      {data.sends.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line p-10 text-center">
          <p className="font-display font-bold">Nada por aqui</p>
          <p className="mt-1 text-sm text-muted">
            Ainda não há envios concluídos com esse filtro.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2.5 font-medium">Quando</th>
                <th className="px-4 py-2.5 font-medium">Grupo</th>
                <th className="px-4 py-2.5 font-medium">Origem</th>
                <th className="px-4 py-2.5 font-medium">Mensagem</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {data.sends.map((send) => {
                const st = displayStatus(send);
                return (
                  <tr key={send.id} className="align-baseline">
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs tabular-nums text-muted">
                      {shortStamp(send.sent_at ?? send.scheduled_at)}
                    </td>
                    <td className="max-w-[14rem] truncate px-4 py-2">
                      {send.wa_subject || send.wa_group_id}
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-2 text-muted">
                      {send.campaign_name ? (
                        <>
                          {send.campaign_name}
                          {send.post_role && <span className="text-xs"> · {send.post_role}</span>}
                        </>
                      ) : (
                        <span className="font-mono text-xs">avulso</span>
                      )}
                    </td>
                    <td className="max-w-[20rem] truncate px-4 py-2 text-muted">
                      {send.payload.text || "(só mídia)"}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={st} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      {st === "cancelado" && (
                        <button
                          onClick={() => retry(send.id)}
                          disabled={pending}
                          className="text-xs font-semibold text-emeraldd hover:underline disabled:opacity-50"
                        >
                          reenviar
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

      {/* Paginação */}
      {data.pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between font-mono text-xs">
          <button
            onClick={() => go({ pagina: String(data.page - 1) }, true)}
            disabled={data.page <= 1}
            className="rounded-lg border border-line px-3 py-1.5 hover:bg-white disabled:opacity-40"
          >
            ‹ anterior
          </button>
          <span className="text-muted">
            página {data.page} de {data.pageCount}
          </span>
          <button
            onClick={() => go({ pagina: String(data.page + 1) }, true)}
            disabled={data.page >= data.pageCount}
            className="rounded-lg border border-line px-3 py-1.5 hover:bg-white disabled:opacity-40"
          >
            próxima ›
          </button>
        </div>
      )}
    </div>
  );
}
