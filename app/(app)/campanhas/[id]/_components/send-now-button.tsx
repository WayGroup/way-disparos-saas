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
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{
    ok: number;
    failed: number;
    queued: number;
    skipped: number;
  } | null>(null);

  function send() {
    const alvo = groupCount === 1 ? "1 grupo" : `${groupCount} grupos`;
    if (!confirm(`Enviar esta mensagem AGORA em ${alvo}?\n\nIsso é real e não tem desfazer.`)) return;

    setIssues([]);
    setSent(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await sendPieceNowAction(campaignId, postId);
        if (result.ok) {
          setSent({
            ok: result.sent,
            failed: result.failed,
            queued: result.queued,
            skipped: result.skipped,
          });
          router.refresh();
        } else {
          setIssues(result.issues);
        }
      } catch (e) {
        // Erro na tela, não tela de erro. Um disparo que falha não pode derrubar a página.
        setError(e instanceof Error ? e.message : "Falha ao enviar. Tente de novo.");
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

      {error && <p className="mt-1.5 text-xs text-risk text-left">{error}</p>}

      {sent && (
        <p className="mt-1.5 text-xs text-left">
          {sent.ok === 0 && sent.failed === 0 && sent.queued === 0 ? (
            <span className="text-muted">
              Esta peça já foi enviada para {sent.skipped === 1 ? "esse grupo" : "todos esses grupos"}.
            </span>
          ) : (
            <span className="text-emeraldd">
              {sent.ok} enviado(s)
              {sent.failed > 0 && `, ${sent.failed} com falha`}
              {sent.queued > 0 && `, ${sent.queued} saindo espaçado nos próximos minutos`}
              {sent.skipped > 0 && `, ${sent.skipped} pulado(s) por já ter sido enviado`}.{" "}
              <a href="/disparos" className="underline">Ver em Disparos</a>
            </span>
          )}
        </p>
      )}
    </div>
  );
}
