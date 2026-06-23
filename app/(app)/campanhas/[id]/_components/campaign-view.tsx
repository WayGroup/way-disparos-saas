"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignWithContent } from "@/lib/db/types";
import { approveCampaignAction } from "../../actions";

export function CampaignView({ campaign }: { campaign: CampaignWithContent }) {
  const router = useRouter();
  const [track, setTrack] = useState<"api" | "grupos">("api");
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <header className="sticky top-0 z-10 bg-paper/90 backdrop-blur border-b border-line px-8 py-4 flex items-center justify-between">
        <div>
          <button onClick={() => router.push("/campanhas")} className="font-mono text-xs text-muted hover:text-ink">← Campanhas</button>
          <h1 className="font-display font-bold text-2xl mt-0.5">{campaign.name}</h1>
          <div className="flex items-center gap-3 mt-1 font-mono text-xs text-muted">
            <span>{campaign.touches.length} toques</span><span>·</span>
            <span>{campaign.group_posts.length} posts</span><span>·</span>
            <span className={campaign.status === "aprovada" ? "text-emeraldd" : "text-risk"}>{campaign.status}</span>
          </div>
        </div>
        <button
          onClick={() => startTransition(async () => { await approveCampaignAction(campaign.id); router.refresh(); })}
          disabled={pending || campaign.status === "aprovada"}
          className="rounded-lg bg-emerald hover:bg-emeraldd transition text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {campaign.status === "aprovada" ? "Aprovada ✓" : pending ? "Aprovando…" : "Aprovar campanha"}
        </button>
      </header>

      <div className="p-8">
        <div className="flex gap-1 bg-line/40 rounded-lg p-1 w-fit mb-5">
          <button onClick={() => setTrack("api")} className={`rounded-md px-4 py-1.5 text-sm font-medium ${track === "api" ? "bg-white shadow-sm" : "text-muted"}`}>API individual <span className="font-mono text-xs text-muted">· {campaign.touches.length}</span></button>
          <button onClick={() => setTrack("grupos")} className={`rounded-md px-4 py-1.5 text-sm font-medium ${track === "grupos" ? "bg-white shadow-sm" : "text-muted"}`}>Grupos <span className="font-mono text-xs">· {campaign.group_posts.length}</span></button>
        </div>

        {track === "api" ? (
          <div className="space-y-5 max-w-3xl">
            {campaign.touches.map((t, i) => (
              <div key={t.id} className={`rounded-xl border bg-white p-5 ${t.risk_flag ? "border-risk/40" : "border-line"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><span className="font-mono text-xs text-emeraldd font-semibold">{t.offset_label}</span><span className="font-display font-bold">{t.role}</span></div>
                  <div className="flex items-center gap-2">
                    {t.risk_flag && <span className="rounded-full bg-risk/15 text-risk text-xs font-mono px-2.5 py-1">⚠ risco reclassificação</span>}
                    <span className={`rounded-full text-xs font-mono font-medium px-2.5 py-1 ${t.meta_category === "UTILITY" ? "bg-utility/12 text-utility" : "bg-marketing/12 text-marketing"}`}>{t.meta_category}</span>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="pl-3 border-l-2 border-ink2">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-ink2">Template · pago</div>
                    <p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap">{t.template_body}</p>
                    <div className="flex gap-2 mt-2 flex-wrap">{t.buttons.map((b, bi) => <span key={bi} className="rounded-full border border-line text-xs px-3 py-1">{b}</span>)}</div>
                  </div>
                  <div className="pl-3 border-l-2 border-emerald">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-emeraldd">Janela 24h · grátis</div>
                    {t.window_steps.map((w, wi) => <p key={wi} className="text-sm mt-1 leading-relaxed"><span className="font-medium">{w.media}:</span> {w.caption}</p>)}
                  </div>
                  <div className="pl-3 border-l-2 border-line">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted">Fallback</div>
                    <p className="text-sm mt-1 leading-relaxed text-ink2 whitespace-pre-wrap">{t.fallback_copy}</p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-line font-mono text-xs text-muted">CRM: {t.crm_action}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-5 max-w-3xl">
            {campaign.group_posts.map((p) => (
              <div key={p.id} className="rounded-xl border border-line bg-white p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><span className="font-mono text-xs text-emeraldd font-semibold">{p.offset_label}</span><span className="font-display font-bold">{p.role}</span></div>
                  <span className="rounded-full bg-ink/8 text-ink2 text-xs font-mono px-2.5 py-1">POST EM GRUPO</span>
                </div>
                <div className="mt-2 font-mono text-xs text-muted">Comunidades: {p.communities}</div>
                <div className="pl-3 border-l-2 border-ink2 mt-3">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-ink2">Mensagem do post</div>
                  <p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap">{p.copy}</p>
                  <p className="text-xs text-muted mt-2 font-mono">Mídia sugerida: {p.media}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
