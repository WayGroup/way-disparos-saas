import type { DisplayStatus } from "@/lib/sends/status";

const STYLE: Record<DisplayStatus, string> = {
  aguardando: "border-line bg-white text-muted",
  pendente: "border-emerald/40 bg-emerald/10 text-emeraldd",
  enviando: "border-risk/40 bg-risk/10 text-risk",
  enviado: "border-line bg-paper text-muted",
  falhou: "border-risk bg-risk/15 text-risk",
  expirado: "border-line bg-paper text-muted line-through",
  cancelado: "border-line bg-paper text-muted line-through",
};

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  aguardando: "aguardando aprovação",
  pendente: "vai sair",
  enviando: "enviando",
  enviado: "enviado",
  falhou: "falhou",
  expirado: "atrasado demais",
  cancelado: "cancelado",
};

export function StatusBadge({ status, attempts }: { status: DisplayStatus; attempts?: number }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
      {attempts && attempts > 1 ? <span className="ml-1 font-mono">· {attempts}ª</span> : null}
    </span>
  );
}
