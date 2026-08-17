"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignGroupPost, Asset, Community } from "@/lib/db/types";
import { updateGroupPostAction, setPostAssetAction, setPostLinkPreviewAction, deleteGroupPostAction, type PostFields } from "../../actions";
import { CopyButton } from "./copy-button";
import { formatSendAt } from "@/lib/schedule";
import { MediaPicker } from "./media-picker";
import { GroupMultiSelect } from "./group-multi-select";
import { SendNowButton } from "./send-now-button";

const COPY_REVEAL = "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity";

export function PostCard({ campaignId, post, assets, groups, highlight = false }: { campaignId: string; post: CampaignGroupPost; assets: Asset[]; groups: Community[]; highlight?: boolean }) {
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

  function excluir() {
    // Aviso incondicional: mesmo campanha em rascunho pode ter mensagens que já saíram de
    // verdade, via "Enviar agora" (grava com forced: true, furando o portão da aprovação).
    // O status da campanha não é um proxy confiável de "esta peça tem envios" — então o
    // texto não varia com ele. Numa peça recém-criada as duas cláusulas são vacuamente
    // verdadeiras (não há pendente nem enviado); nunca erra para o lado perigoso.
    const go = confirm(
      "Excluir esta peça?\n\n" +
        "Ela some da campanha, os envios pendentes dela são cancelados, e o histórico do que já saiu por esta peça some junto.\n\n" +
        "Não tem desfazer.",
    );
    if (!go) return;
    startTransition(async () => {
      await deleteGroupPostAction(campaignId, post.id);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div id={`grupos-${post.sort_order}`} className={`rounded-2xl border border-line bg-white p-6 scroll-mt-24 transition-shadow ${highlight ? "ring-2 ring-emerald ring-offset-2" : ""}`}>
        {/* cabeçalho */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs text-emeraldd font-semibold">{post.offset_label}</span>
            <h3 className="font-display font-bold text-lg leading-tight">{post.role}</h3>
          </div>
          <span className="rounded-full bg-ink/8 text-ink2 text-[11px] font-mono px-2.5 py-1 shrink-0">POST EM GRUPO</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <span className="inline-flex items-center gap-2">
            <span className="font-mono bg-paper border border-line rounded px-2 py-0.5">{post.message_code || "— sem código —"}</span>
            <CopyButton text={post.message_code} label="copiar código" />
          </span>
          {post.send_at && (
            <span className="inline-flex items-center gap-2 font-mono text-emeraldd">
              <span>📅 {formatSendAt(post.send_at)}</span>
              <CopyButton text={post.send_at} />
            </span>
          )}
        </div>

        {/* mensagem */}
        <section className="group mt-5 rounded-xl border border-line p-4">
          <div className="flex items-center justify-between border-b border-line pb-2 mb-3">
            <div className="font-mono text-[11px] uppercase tracking-widest text-ink2">Mensagem do post</div>
            <CopyButton text={post.copy} label="copiar mensagem" className={COPY_REVEAL} />
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.copy}</p>
          {post.media && (
            <div className="mt-3">
              <MediaPicker assets={assets} currentId={post.asset_id} suggestion={post.media} onPick={(id) => setPostAssetAction(campaignId, post.sort_order, id)} />
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[11px] text-muted">
              Prévia do link {post.link_preview ? "— mostra o card com imagem" : "— só o texto, sem card"}
            </span>
            <button
              onClick={() =>
                startTransition(async () => {
                  await setPostLinkPreviewAction(campaignId, post.id, !post.link_preview);
                  router.refresh();
                })
              }
              disabled={pending}
              role="switch"
              aria-checked={post.link_preview}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                post.link_preview
                  ? "border-emerald bg-emerald/10 text-emeraldd"
                  : "border-line text-muted hover:border-emerald/40"
              }`}
            >
              {post.link_preview ? "✓ prévia ligada" : "prévia desligada"}
            </button>
          </div>
          <div className="mt-4 pt-3 border-t border-line">
            <GroupMultiSelect
              campaignId={campaignId}
              postId={post.id}
              selected={post.community_ids}
              suggestion={post.communities}
              groups={groups}
            />
            {post.communities && (
              <p className="mt-2 font-mono text-[11px] text-muted">
                Sugestão da IA: {post.communities}
              </p>
            )}
          </div>
        </section>

        {/* rodapé */}
        <div className="mt-5 pt-3 border-t border-line flex justify-end items-start gap-4">
          <button onClick={() => setEditing(true)} className="text-xs text-ink2 font-medium hover:underline">Editar</button>
          <button onClick={regenerate} disabled={pending} className="text-xs text-emeraldd font-medium hover:underline disabled:opacity-50">Regenerar</button>
          <SendNowButton campaignId={campaignId} postId={post.id} groupCount={post.community_ids.length} />
          <button onClick={excluir} disabled={pending} className="text-xs text-risk font-medium hover:underline disabled:opacity-50">Excluir</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald/40 bg-white p-5 space-y-3">
      {/* O alvo do disparo não se edita aqui: são os grupos reais, escolhidos no cartão. */}
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Offset</span><input value={f.offset_label} onChange={(e) => setF({ ...f, offset_label: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
        <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Papel</span><input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      </div>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Código da mensagem</span><input value={f.message_code} onChange={(e) => setF({ ...f, message_code: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Mensagem do post</span><textarea value={f.copy} onChange={(e) => setF({ ...f, copy: e.target.value })} rows={3} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <label className="block"><span className="text-[10px] font-mono uppercase text-muted">Briefing da mídia</span><textarea value={f.media} onChange={(e) => setF({ ...f, media: e.target.value })} rows={3} placeholder="Deixe vazio para peça só-texto (sem anexo)." className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={pending} className="rounded-lg bg-emerald hover:bg-emeraldd text-white text-sm font-semibold px-3 py-1.5 disabled:opacity-50">{pending ? "Salvando…" : "Salvar"}</button>
        <button onClick={() => setEditing(false)} className="rounded-lg border border-line text-sm px-3 py-1.5">Cancelar</button>
      </div>
    </div>
  );
}
