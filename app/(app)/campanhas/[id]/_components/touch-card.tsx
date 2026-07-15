"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignTouch, Asset } from "@/lib/db/types";
import { updateTouchAction, setTouchStepAssetAction, type TouchFields } from "../../actions";
import { CopyButton } from "./copy-button";
import { formatSendAt } from "@/lib/schedule";
import { utilityAltName } from "@/lib/campaign-touch";
import { MediaPicker } from "./media-picker";

const COPY_REVEAL = "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity";
const COPY_REVEAL_STEP = "opacity-0 group-hover/step:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity";

export function TouchCard({ campaignId, touch, assets, highlight = false }: { campaignId: string; touch: CampaignTouch; assets: Asset[]; highlight?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState<TouchFields>({
    offset_label: touch.offset_label, role: touch.role, meta_category: touch.meta_category,
    template_body: touch.template_body, buttons: touch.buttons, window_steps: touch.window_steps,
    fallback_copy: touch.fallback_copy, crm_action: touch.crm_action, risk_flag: touch.risk_flag,
    template_name: touch.template_name, utility_alt: touch.utility_alt,
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
      <div id={`api-${touch.sort_order}`} className={`rounded-2xl border bg-white p-6 scroll-mt-24 transition-shadow ${touch.risk_flag ? "border-risk/40" : "border-line"} ${highlight ? "ring-2 ring-emerald ring-offset-2" : ""}`}>
        {/* cabeçalho */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs text-emeraldd font-semibold">{touch.offset_label}</span>
            <h3 className="font-display font-bold text-lg leading-tight">{touch.role}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {touch.risk_flag && <span className="rounded-full bg-risk/15 text-risk text-[11px] font-mono px-2.5 py-1">⚠ risco reclassificação</span>}
            <span className={`rounded-full text-[11px] font-mono font-medium px-2.5 py-1 ${touch.meta_category === "UTILITY" ? "bg-utility/12 text-utility" : "bg-marketing/12 text-marketing"}`}>{touch.meta_category}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <span className="inline-flex items-center gap-2">
            <span className="font-mono bg-paper border border-line rounded px-2 py-0.5">{touch.template_name || "— sem nome —"}</span>
            <CopyButton text={touch.template_name} label="copiar nome" />
          </span>
          {touch.send_at && (
            <span className="inline-flex items-center gap-2 font-mono text-emeraldd">
              <span>📅 {formatSendAt(touch.send_at)}</span>
              <CopyButton text={touch.send_at} />
            </span>
          )}
        </div>

        {/* blocos */}
        <div className="mt-5 space-y-4">
          {/* template */}
          <section className="group rounded-xl border border-line p-4">
            <div className="flex items-center justify-between border-b border-line pb-2 mb-3">
              <div className="font-mono text-[11px] uppercase tracking-widest text-ink2">Template <span className="text-muted">· pago</span></div>
              <CopyButton text={touch.template_body} label="copiar texto" className={COPY_REVEAL} />
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{touch.template_body}</p>
            {touch.buttons.length > 0 && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {touch.buttons.map((b, bi) => (
                  <span key={bi} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-xs">
                    <span>{b.type === "url" ? "🔗" : "↩"}</span>
                    <span>{b.text}</span>
                    {b.type === "url" && b.url && <a href={b.url} target="_blank" rel="noreferrer" className="text-emeraldd underline truncate max-w-[160px]">{b.url}</a>}
                  </span>
                ))}
                <CopyButton text={touch.buttons.map((b) => b.type === "url" ? `${b.text} → ${b.url}` : b.text).join("\n")} label="copiar botões" className={COPY_REVEAL} />
              </div>
            )}
          </section>

          {/* versão UTILITY alternativa */}
          {touch.utility_alt && touch.utility_alt.template_body && (
            <section className="group rounded-xl border border-line p-4">
              <div className="flex items-center justify-between border-b border-line pb-2 mb-3">
                <div className="font-mono text-[11px] uppercase tracking-widest text-utility">Versão UTILITY <span className="text-muted">· alternativa</span></div>
                <div className="flex items-center gap-2 shrink-0">
                  {touch.utility_alt.risk_flag && <span className="rounded-full bg-risk/15 text-risk text-[11px] font-mono px-2 py-0.5">⚠ risco reclassificação</span>}
                  <CopyButton text={touch.utility_alt.template_body} label="copiar texto" className={COPY_REVEAL} />
                </div>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{touch.utility_alt.template_body}</p>
              {touch.utility_alt.buttons.length > 0 && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {touch.utility_alt.buttons.map((b, bi) => (
                    <span key={bi} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-xs">
                      <span>{b.type === "url" ? "🔗" : "↩"}</span>
                      <span>{b.text}</span>
                      {b.type === "url" && b.url && <a href={b.url} target="_blank" rel="noreferrer" className="text-emeraldd underline truncate max-w-[160px]">{b.url}</a>}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="font-mono text-muted">nome sugerido:</span>
                <span className="font-mono bg-paper border border-line rounded px-2 py-0.5">{utilityAltName(touch.template_name)}</span>
                <CopyButton text={utilityAltName(touch.template_name)} label="copiar nome" />
              </div>
            </section>
          )}

          {/* janela 24h */}
          <section className="rounded-xl border border-line p-4">
            <div className="font-mono text-[11px] uppercase tracking-widest text-emeraldd border-b border-line pb-2 mb-3">Janela 24h <span className="text-muted">· grátis</span></div>
            <div className="space-y-2.5">
              {touch.window_steps.map((w, wi) => (
                <div key={wi} className="group/step rounded-lg border border-line bg-paper/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm leading-relaxed">{w.caption}</p>
                    <CopyButton text={w.caption} className={`shrink-0 ${COPY_REVEAL_STEP}`} />
                  </div>
                  {w.media && (
                    <MediaPicker assets={assets} currentId={w.asset_id ?? null} suggestion={w.media} onPick={(id) => setTouchStepAssetAction(campaignId, touch.sort_order, wi, id)} />
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* fallback */}
          <section className="group rounded-xl border border-line p-4">
            <div className="flex items-center justify-between border-b border-line pb-2 mb-3">
              <div className="font-mono text-[11px] uppercase tracking-widest text-muted">Fallback</div>
              <CopyButton text={touch.fallback_copy} className={COPY_REVEAL} />
            </div>
            <p className="text-sm leading-relaxed text-ink2 whitespace-pre-wrap">{touch.fallback_copy}</p>
          </section>
        </div>

        {/* rodapé */}
        <div className="group mt-5 pt-3 border-t border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs text-muted truncate">CRM: {touch.crm_action}</span>
            <CopyButton text={touch.crm_action} label="copiar crm" className={`shrink-0 ${COPY_REVEAL}`} />
          </div>
          <div className="flex gap-3 shrink-0">
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
      <div className="block space-y-2">
        <span className="text-[10px] font-mono uppercase text-muted">Botões</span>
        {f.buttons.map((b, bi) => (
          <div key={bi} className="flex gap-2 items-center">
            <select value={b.type} onChange={(e) => setF({ ...f, buttons: f.buttons.map((x, i) => i === bi ? { ...x, type: e.target.value as "quick_reply" | "url" } : x) })} className="rounded-lg border border-line p-1.5 text-xs">
              <option value="quick_reply">resposta rápida</option>
              <option value="url">URL</option>
            </select>
            <input value={b.text} onChange={(e) => setF({ ...f, buttons: f.buttons.map((x, i) => i === bi ? { ...x, text: e.target.value } : x) })} placeholder="texto do botão" className="flex-1 rounded-lg border border-line p-1.5 text-xs" />
            {b.type === "url" && <input value={b.url} onChange={(e) => setF({ ...f, buttons: f.buttons.map((x, i) => i === bi ? { ...x, url: e.target.value } : x) })} placeholder="https://…" className="flex-1 rounded-lg border border-line p-1.5 text-xs" />}
            <button type="button" onClick={() => setF({ ...f, buttons: f.buttons.filter((_, i) => i !== bi) })} className="text-xs text-muted hover:text-risk">×</button>
          </div>
        ))}
        <button type="button" onClick={() => setF({ ...f, buttons: [...f.buttons, { type: "quick_reply", text: "", url: "" }] })} className="text-xs text-emeraldd hover:underline">+ adicionar botão</button>
      </div>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Fallback</span><textarea value={f.fallback_copy} onChange={(e) => setF({ ...f, fallback_copy: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Ação de CRM</span><input value={f.crm_action} onChange={(e) => setF({ ...f, crm_action: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={f.risk_flag} onChange={(e) => setF({ ...f, risk_flag: e.target.checked })} className="accent-emerald" /> marcar risco de reclassificação</label>
      {f.utility_alt && (
        <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Corpo da versão UTILITY</span><textarea value={f.utility_alt.template_body} onChange={(e) => setF({ ...f, utility_alt: f.utility_alt ? { ...f.utility_alt, template_body: e.target.value } : null })} rows={3} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      )}
      <p className="text-[11px] text-muted font-mono">A janela de 24h (mídias) é ajustada pelo chat de refino.</p>
      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={pending} className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50">{pending ? "Salvando…" : "Salvar"}</button>
        <button onClick={() => setEditing(false)} className="rounded-lg border border-line text-sm px-3 py-1.5">Cancelar</button>
      </div>
    </div>
  );
}
