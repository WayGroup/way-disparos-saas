"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignTouch } from "@/lib/db/types";
import { updateTouchAction, type TouchFields } from "../../actions";
import { CopyButton } from "./copy-button";

export function TouchCard({ campaignId, touch }: { campaignId: string; touch: CampaignTouch }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState<TouchFields>({
    offset_label: touch.offset_label, role: touch.role, meta_category: touch.meta_category,
    template_body: touch.template_body, buttons: touch.buttons, window_steps: touch.window_steps,
    fallback_copy: touch.fallback_copy, crm_action: touch.crm_action, risk_flag: touch.risk_flag,
    template_name: touch.template_name,
  });

  function save() {
    startTransition(async () => {
      await updateTouchAction(campaignId, touch.sort_order, f);
      setEditing(false);
      router.refresh();
    });
  }

  function regenerate() {
    startTransition(async () => {
      const { refineCampaignAction } = await import("../../actions");
      await refineCampaignAction(campaignId, `Regenere o toque da trilha API com sort_order ${touch.sort_order} ("${touch.role}", ${touch.offset_label}), variando a copy mas mantendo o papel e a categoria. Não mexa nos outros.`);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className={`rounded-xl border bg-white p-5 ${touch.risk_flag ? "border-risk/40" : "border-line"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="font-mono text-xs text-emeraldd font-semibold">{touch.offset_label}</span><span className="font-display font-bold">{touch.role}</span></div>
          <div className="flex items-center gap-2">
            {touch.risk_flag && <span className="rounded-full bg-risk/15 text-risk text-xs font-mono px-2.5 py-1">⚠ risco reclassificação</span>}
            <span className={`rounded-full text-xs font-mono font-medium px-2.5 py-1 ${touch.meta_category === "UTILITY" ? "bg-utility/12 text-utility" : "bg-marketing/12 text-marketing"}`}>{touch.meta_category}</span>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-xs bg-paper border border-line rounded px-2 py-0.5">{touch.template_name || "— sem nome —"}</span>
          <CopyButton text={touch.template_name} label="copiar nome" />
        </div>
        <div className="mt-4 space-y-3">
          <div className="pl-3 border-l-2 border-ink2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink2">Template · pago</div>
            <p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap">{touch.template_body}</p>
            <div className="flex gap-2 mt-2 flex-wrap">{touch.buttons.map((b, bi) => <span key={bi} className="rounded-full border border-line text-xs px-3 py-1">{b}</span>)}</div>
            <div className="mt-2 flex gap-3"><CopyButton text={touch.template_body} label="copiar texto" /><CopyButton text={touch.buttons.join("\n")} label="copiar botões" /></div>
          </div>
          <div className="pl-3 border-l-2 border-emerald">
            <div className="font-mono text-[10px] uppercase tracking-widest text-emeraldd">Janela 24h · grátis</div>
            {touch.window_steps.map((w, wi) => (
              <div key={wi} className="flex items-center justify-between gap-2">
                <p className="text-sm mt-1 leading-relaxed"><span className="font-medium">{w.media}:</span> {w.caption}</p>
                <CopyButton text={`${w.media}: ${w.caption}`} />
              </div>
            ))}
          </div>
          <div className="pl-3 border-l-2 border-line">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted">Fallback</div>
            <p className="text-sm mt-1 leading-relaxed text-ink2 whitespace-pre-wrap">{touch.fallback_copy}</p>
            <CopyButton text={touch.fallback_copy} className="mt-1" />
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted">CRM: {touch.crm_action}</span>
            <CopyButton text={touch.crm_action} label="copiar crm" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setEditing(true)} className="text-xs text-ink2 font-medium hover:underline">Editar</button>
            <button onClick={regenerate} disabled={pending} className="text-xs text-emeraldd font-medium hover:underline disabled:opacity-50">Regenerar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald/40 bg-white p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Offset</span><input value={f.offset_label} onChange={(e) => setF({ ...f, offset_label: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
        <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Categoria Meta</span>
          <select value={f.meta_category} onChange={(e) => setF({ ...f, meta_category: e.target.value as "UTILITY" | "MARKETING" })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm">
            <option value="UTILITY">UTILITY</option><option value="MARKETING">MARKETING</option>
          </select></label>
      </div>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Papel</span><input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Nome do template</span><input value={f.template_name} onChange={(e) => setF({ ...f, template_name: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Template</span><textarea value={f.template_body} onChange={(e) => setF({ ...f, template_body: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Botões (separados por vírgula)</span><input value={f.buttons.join(", ")} onChange={(e) => setF({ ...f, buttons: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Fallback</span><textarea value={f.fallback_copy} onChange={(e) => setF({ ...f, fallback_copy: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Ação de CRM</span><input value={f.crm_action} onChange={(e) => setF({ ...f, crm_action: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={f.risk_flag} onChange={(e) => setF({ ...f, risk_flag: e.target.checked })} className="accent-emerald" /> marcar risco de reclassificação</label>
      <p className="text-[11px] text-muted font-mono">A janela de 24h (mídias) é ajustada pelo chat de refino.</p>
      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={pending} className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50">{pending ? "Salvando…" : "Salvar"}</button>
        <button onClick={() => setEditing(false)} className="rounded-lg border border-line text-sm px-3 py-1.5">Cancelar</button>
      </div>
    </div>
  );
}
