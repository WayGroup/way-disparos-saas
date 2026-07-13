"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendPieceNowAction } from "../../actions";
import type { ScheduleIssue } from "@/lib/sends/plan";

export function SendNowButton({
  campaignId,
  postId,
  groupCount,
}: {
  campaignId: string;
  postId: string;
  groupCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [issues, setIssues] = useState<ScheduleIssue[]>([]);
  const [sent, setSent] = useState<{ ok: number; failed: number; queued: number } | null>(null);

  function send() {
    const alvo = groupCount === 1 ? "1 grupo" : `${groupCount} grupos`;
    if (!confirm(`Enviar esta mensagem AGORA em ${alvo}?\n\nIsso é real e não tem desfazer.`)) return;

    setIssues([]);
    setSent(null);
    startTransition(async () => {
      const result = await sendPieceNowAction(campaignId, postId);
      if (result.ok) {
        setSent({ ok: result.sent, failed: result.failed, queued: result.queued });
        router.refresh();
      } else {
        setIssues(result.issues);
      }
    });
  }

  return (
    <div className="text-right">
      <button
        onClick={send}
        disabled={pending || groupCount === 0}
        title={groupCount === 0 ? "Selecione ao menos um grupo" : undefined}
        className="text-xs text-risk font-semibold hover:underline disabled:opacity-40 disabled:no-underline"
      >
        {pending ? "Enviando…" : "Enviar agora"}
      </button>

      {issues.length > 0 && (
        <ul className="mt-1.5 text-xs text-risk text-left">
          {issues.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </ul>
      )}

      {sent && (
        <p className="mt-1.5 text-xs text-emeraldd text-left">
          {sent.ok} enviado(s)
          {sent.failed > 0 && `, ${sent.failed} com falha`}
          {sent.queued > 0 && `, ${sent.queued} na fila (saem espaçados nos próximos minutos)`}.{" "}
          <a href="/envios" className="underline">Ver em Envios</a>
        </p>
      )}
    </div>
  );
}
