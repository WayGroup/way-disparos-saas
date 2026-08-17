"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeSendAt } from "@/lib/schedule";
import type { ManualPostInput } from "@/lib/campaign-manual-post";
import { createGroupPostAction } from "../../actions";

export function NewGroupPostForm({
  campaignId,
  anchor,
  onClose,
}: {
  campaignId: string;
  anchor: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [f, setF] = useState<Omit<ManualPostInput, "offset_days">>({
    offset_label: "",
    role: "",
    copy: "",
    media: "",
    offset_time: "",
  });
  // Guardado como string, não number: um <input type="number"> controlado com
  // Number(e.target.value) || 0 come o sinal de negativo — ao teclar só o "-", o navegador
  // devolve "", o handler gravaria 0, e o React reescreveria o campo por cima do que a
  // pessoa está digitando. "Negativo = antes da âncora" é o caso de uso do campo, então a
  // conversão para número só acontece na hora de montar o ManualPostInput.
  const [diasStr, setDiasStr] = useState("0");
  const offsetDays = Number(diasStr) || 0;

  // "1 dia antes às 14:00" vira uma data concreta antes de salvar — é o que a pessoa
  // consegue conferir. Mesma função que o servidor usa, então a prévia não mente.
  const previsto = computeSendAt(anchor, offsetDays, f.offset_time);

  function salvar() {
    setErro(null);
    startTransition(async () => {
      try {
        await createGroupPostAction(campaignId, { ...f, offset_days: offsetDays });
        onClose();
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Algo deu errado.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-emerald/40 bg-white p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] font-mono uppercase text-muted">Rótulo</span>
          <input value={f.offset_label} onChange={(e) => setF({ ...f, offset_label: e.target.value })} placeholder="D-1" className="mt-1 w-full rounded-lg border border-line p-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-[10px] font-mono uppercase text-muted">Papel</span>
          <input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Lembrete" className="mt-1 w-full rounded-lg border border-line p-2 text-sm" />
        </label>
      </div>

      <label className="block">
        <span className="text-[10px] font-mono uppercase text-muted">Mensagem</span>
        <textarea value={f.copy} onChange={(e) => setF({ ...f, copy: e.target.value })} rows={4} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" />
      </label>

      <label className="block">
        <span className="text-[10px] font-mono uppercase text-muted">Briefing da mídia</span>
        <textarea value={f.media} onChange={(e) => setF({ ...f, media: e.target.value })} rows={2} placeholder="Deixe vazio para peça só-texto." className="mt-1 w-full rounded-lg border border-line p-2 text-sm" />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] font-mono uppercase text-muted">Dias (negativo = antes)</span>
          <input type="text" inputMode="numeric" value={diasStr} onChange={(e) => setDiasStr(e.target.value)} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-[10px] font-mono uppercase text-muted">Hora (HH:mm)</span>
          <input value={f.offset_time} onChange={(e) => setF({ ...f, offset_time: e.target.value })} placeholder="14:00" className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" />
        </label>
      </div>

      <p className="font-mono text-xs text-muted">
        {previsto ? `Vai sair em ${previsto}` : "Sem data — confira a hora, ou a campanha está sem âncora."}
      </p>

      {erro && <p className="rounded-lg border border-risk/30 bg-risk/5 p-3 text-sm text-risk">{erro}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={salvar} disabled={pending || !f.role.trim() || !f.copy.trim()} className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50">
          {pending ? "Criando…" : "Criar peça"}
        </button>
        <button onClick={onClose} disabled={pending} className="rounded-lg border border-line text-sm px-3 py-1.5 disabled:opacity-50">Cancelar</button>
      </div>
    </div>
  );
}
