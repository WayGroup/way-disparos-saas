"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignGroupPost } from "@/lib/db/types";
import { updateGroupPostAction, type PostFields } from "../../actions";
import { CopyButton } from "./copy-button";
import { formatSendAt } from "@/lib/schedule";

export function PostCard({ campaignId, post }: { campaignId: string; post: CampaignGroupPost }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState<PostFields>({
    offset_label: post.offset_label, role: post.role, communities: post.communities, copy: post.copy, media: post.media,
    message_code: post.message_code,
  });

  function save() {
    startTransition(async () => {
      await updateGroupPostAction(campaignId, post.sort_order, f);
      setEditing(false);
      router.refresh();
    });
  }

  function regenerate() {
    startTransition(async () => {
      const { refineCampaignAction } = await import("../../actions");
      await refineCampaignAction(campaignId, `Regenere o post da trilha Grupos com sort_order ${post.sort_order} ("${post.role}", ${post.offset_label}), variando a copy. Não mexa nos outros.`);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="font-mono text-xs text-emeraldd font-semibold">{post.offset_label}</span><span className="font-display font-bold">{post.role}</span></div>
          <span className="rounded-full bg-ink/8 text-ink2 text-xs font-mono px-2.5 py-1">POST EM GRUPO</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-xs bg-paper border border-line rounded px-2 py-0.5">{post.message_code || "— sem código —"}</span>
          <CopyButton text={post.message_code} label="copiar código" />
          {post.send_at && (
            <span className="inline-flex items-center gap-2 font-mono text-xs bg-emerald/10 text-emeraldd rounded px-2 py-0.5">
              📅 {formatSendAt(post.send_at)}
              <CopyButton text={post.send_at} />
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 font-mono text-xs text-muted">
          <span>Comunidades: {post.communities}</span>
          <CopyButton text={post.communities} />
        </div>
        <div className="pl-3 border-l-2 border-ink2 mt-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink2">Mensagem do post</div>
          <p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap">{post.copy}</p>
          <p className="text-xs text-muted mt-2 font-mono">Mídia sugerida: {post.media}</p>
          <div className="mt-2 flex gap-3"><CopyButton text={post.copy} label="copiar mensagem" /><CopyButton text={post.media} label="copiar mídia" /></div>
        </div>
        <div className="mt-4 pt-3 border-t border-line flex justify-end gap-3">
          <button onClick={() => setEditing(true)} className="text-xs text-ink2 font-medium hover:underline">Editar</button>
          <button onClick={regenerate} disabled={pending} className="text-xs text-emeraldd font-medium hover:underline disabled:opacity-50">Regenerar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald/40 bg-white p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Offset</span><input value={f.offset_label} onChange={(e) => setF({ ...f, offset_label: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
        <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Comunidades</span><input value={f.communities} onChange={(e) => setF({ ...f, communities: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      </div>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Papel</span><input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Código da mensagem</span><input value={f.message_code} onChange={(e) => setF({ ...f, message_code: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Mensagem do post</span><textarea value={f.copy} onChange={(e) => setF({ ...f, copy: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Mídia sugerida</span><input value={f.media} onChange={(e) => setF({ ...f, media: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={pending} className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50">{pending ? "Salvando…" : "Salvar"}</button>
        <button onClick={() => setEditing(false)} className="rounded-lg border border-line text-sm px-3 py-1.5">Cancelar</button>
      </div>
    </div>
  );
}
