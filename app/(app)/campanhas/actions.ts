"use server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { getRecipe } from "@/lib/db/recipes";
import { getCampaign } from "@/lib/db/campaigns";
import { listBrandBlocks } from "@/lib/db/brand-knowledge";
import { compileBrandKnowledge } from "@/lib/ai/brand";
import { generateCampaign } from "@/lib/ai/generate";
import { refineCampaign } from "@/lib/ai/refine";
import { buildCode } from "@/lib/ai/nomenclature";
import { computeSendAt } from "@/lib/schedule";
import { nextSortOrder, pickReferenceGroups, slugCode, formatAddedSeal } from "@/lib/campaign-refine";
import { listActiveGroups } from "@/lib/db/communities";
import { listAssets } from "@/lib/db/assets";
import { publicAssetUrl } from "@/lib/campaign-pieces";
import { buildSendPayload } from "@/lib/sends/payload";
import { planSends, validateSchedulable, type ScheduleIssue } from "@/lib/sends/plan";
import { partitionSchedulable } from "@/lib/sends/reschedule";
import { dispatchDue } from "@/lib/sends/dispatch";

type GenLog = { campaign_id?: string; recipe_id: string; kind: string; ok: boolean; error?: string; duration_ms: number };

// Log best-effort de geração: a tabela ai_generation_logs (migração 0009) pode ainda não estar aplicada;
// qualquer erro do insert é ignorado para nunca quebrar a geração.
async function logGeneration(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  entry: GenLog,
): Promise<void> {
  try {
    await supabase.from("ai_generation_logs").insert(entry);
  } catch {
    /* ignore */
  }
}

export type TouchFields = {
  offset_label: string;
  role: string;
  meta_category: "UTILITY" | "MARKETING";
  template_body: string;
  buttons: { type: "quick_reply" | "url"; text: string; url: string }[];
  window_steps: { media: string; caption: string }[];
  fallback_copy: string;
  crm_action: string;
  risk_flag: boolean;
  template_name: string;
};

export type PostFields = {
  offset_label: string;
  role: string;
  communities: string;
  copy: string;
  media: string;
  message_code: string;
};

export async function generateCampaignAction(
  recipeId: string,
  name: string,
  inputs: Record<string, string>,
  communityIds: string[] = [],
): Promise<string> {
  const recipe = await getRecipe(recipeId);
  if (!recipe) throw new Error("Receita não encontrada.");
  const brandText = compileBrandKnowledge(await listBrandBlocks());
  const supabase = await createServerSupabase();

  const startedAt = Date.now();
  let content;
  try {
    content = await generateCampaign(recipe, inputs, brandText);
  } catch (e) {
    await logGeneration(supabase, {
      recipe_id: recipeId, kind: "generate", ok: false,
      error: e instanceof Error ? e.message : String(e), duration_ms: Date.now() - startedAt,
    });
    throw e;
  }

  const anchorLabel = recipe.inputs.find((i) => i.is_anchor)?.label;
  const anchorValue = anchorLabel ? (inputs[anchorLabel] ?? "") : "";
  const apiSlots = recipe.slots.filter((s) => s.track === "api");
  const gruposSlots = recipe.slots.filter((s) => s.track === "grupos");

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({ recipe_id: recipeId, name: name.trim() || recipe.name, inputs })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao salvar campanha: ${error.message}`);
  const campaignId = campaign.id as string;

  try {
    if (content.touches.length > 0) {
      const { error: e1 } = await supabase.from("campaign_touches").insert(
        content.touches.map((t, idx) => ({
          campaign_id: campaignId,
          sort_order: idx,
          ...t,
          template_name: buildCode(recipe.recipe_type, apiSlots[idx]?.code ?? "", anchorValue),
          send_at: computeSendAt(anchorValue, apiSlots[idx]?.offset_days ?? 0, apiSlots[idx]?.offset_time ?? ""),
        })),
      );
      if (e1) throw new Error(`Falha ao salvar toques: ${e1.message}`);
    }
    if (content.group_posts.length > 0) {
      const { data: newPosts, error: e2 } = await supabase.from("campaign_group_posts").insert(
        content.group_posts.map((p, idx) => ({
          campaign_id: campaignId,
          sort_order: idx,
          ...p,
          message_code: buildCode(recipe.recipe_type, gruposSlots[idx]?.code ?? "", anchorValue),
          send_at: computeSendAt(anchorValue, gruposSlots[idx]?.offset_days ?? 0, gruposSlots[idx]?.offset_time ?? ""),
        })),
      ).select("id");
      if (e2) throw new Error(`Falha ao salvar posts: ${e2.message}`);

      // A seleção da campanha é COPIADA para cada peça — não herdada. A peça segue
      // sendo a única fonte de verdade sobre para onde ela vai, e pode divergir depois.
      const posts = newPosts ?? [];
      if (communityIds.length > 0 && posts.length > 0) {
        const links = posts.flatMap((p) =>
          communityIds.map((community_id) => ({ post_id: p.id as string, community_id })),
        );
        const { error: e3 } = await supabase.from("campaign_group_post_communities").insert(links);
        if (e3) throw new Error(`Falha ao vincular grupos: ${e3.message}`);
      }
    }
  } catch (e) {
    // rollback compensatório: remove a campanha órfã antes de propagar o erro
    await supabase.from("campaigns").delete().eq("id", campaignId);
    await logGeneration(supabase, {
      recipe_id: recipeId, kind: "generate", ok: false,
      error: e instanceof Error ? e.message : String(e), duration_ms: Date.now() - startedAt,
    });
    throw e;
  }

  await logGeneration(supabase, {
    campaign_id: campaignId, recipe_id: recipeId, kind: "generate", ok: true, duration_ms: Date.now() - startedAt,
  });

  // A fila nasce montada — e travada: o worker só entrega envio de campanha aprovada.
  // Se falhar, a campanha continua de pé; a fila se remonta em qualquer edição ou na
  // aprovação. Não vale destruir uma geração que custou 1 min de IA por causa disto.
  try {
    await rescheduleCampaign(campaignId);
  } catch (e) {
    console.error(`Campanha ${campaignId} gerada, mas a fila não foi montada:`, e);
  }

  revalidatePath("/campanhas");
  return campaignId;
}

/**
 * Monta as peças agendáveis da trilha Grupos, congelando texto e mídia no payload.
 * A trilha API continua manual — não entra na fila.
 */
async function buildGroupPieces(campaignId: string) {
  const [campaign, groups, assets] = await Promise.all([
    getCampaign(campaignId),
    listActiveGroups(),
    listAssets(),
  ]);
  if (!campaign) throw new Error("Campanha não encontrada.");

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const pieces = campaign.group_posts.map((post) => ({
    post_id: post.id,
    label: `${post.role} (${post.offset_label})`,
    send_at: post.send_at,
    payload: buildSendPayload(
      post.copy,
      post.asset_id ? (assetById.get(post.asset_id) ?? null) : null,
      publicAssetUrl,
      post.link_preview,
    ),
    targets: post.community_ids.flatMap((id) => {
      const g = groupById.get(id);
      // Grupo desativado ou sem JID some da lista de alvos; validate reclama depois.
      return g?.wa_group_id ? [{ community_id: g.id, wa_group_id: g.wa_group_id, wa_subject: g.wa_subject }] : [];
    }),
  }));

  return { campaign, pieces };
}

/**
 * Remonta a fila da campanha a partir do conteúdo atual das peças.
 *
 * Cada linha da fila guarda um snapshot do texto e da mídia. Sem isto, editar a peça
 * deixaria a fila velha — o grupo receberia a versão antiga. Só apaga os `pendente`:
 * o que já saiu, está saindo ou falhou é intocável.
 *
 * Não mexe no status da campanha. Rascunho continua rascunho, e o worker — que só
 * entrega envio de campanha aprovada — segue segurando a fila. É por isso que dá para
 * montar a fila na geração sem que nada dispare.
 */
async function rescheduleCampaign(
  campaignId: string,
): Promise<{ scheduled: number; past: string[] }> {
  const { pieces } = await buildGroupPieces(campaignId);
  const { schedulable, past } = partitionSchedulable(pieces);

  const supabase = await createServerSupabase();
  const { error: eDel } = await supabase
    .from("scheduled_sends")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("status", "pendente")
    // Um "Enviar agora" em voo (grupos seguintes, espaçados pelo jitter) não pode ser
    // cancelado por uma edição feita nesse meio-tempo.
    .eq("forced", false);
  if (eDel) throw new Error(`Falha ao limpar a fila: ${eDel.message}`);

  const planned = planSends(schedulable);
  if (planned.length > 0) {
    const batchId = crypto.randomUUID();
    const rows = planned.map((s) => ({ ...s, batch_id: batchId, campaign_id: campaignId }));
    const { error } = await supabase.from("scheduled_sends").insert(rows);
    if (error) throw new Error(`Falha ao agendar envios: ${error.message}`);
  }

  revalidatePath(`/campanhas/${campaignId}`);
  revalidatePath("/disparos");
  return { scheduled: planned.length, past: past.map((p) => p.label) };
}

export type ScheduleResult =
  | { ok: true; scheduled: number; past: string[] }
  | { ok: false; issues: ScheduleIssue[] };

/**
 * Aprovar não é mais um selo: é o gatilho do envio. Valida tudo primeiro e,
 * se houver qualquer problema, não escreve nada — nada de agendar meia campanha.
 *
 * Os problemas voltam como valor, não como exceção: em produção o Next.js mascara
 * a mensagem de erros lançados numa Server Action, e o usuário precisa ver a lista.
 */
export async function approveAndScheduleAction(id: string): Promise<ScheduleResult> {
  const { pieces } = await buildGroupPieces(id);

  // Aprovar é rigoroso: qualquer peça inagendável bloqueia tudo. É o estado "vai pro ar".
  const issues = validateSchedulable(pieces);
  if (issues.length > 0) return { ok: false, issues };

  // Peça no passado não bloqueia a aprovação — uma campanha pode ter toques antigos e
  // futuros ao mesmo tempo. Ela só nunca entra na fila, e quem aprova fica sabendo.
  const { scheduled, past } = await rescheduleCampaign(id);

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("campaigns")
    .update({ status: "aprovada", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Falha ao aprovar campanha: ${error.message}`);

  revalidatePath("/campanhas");
  revalidatePath(`/campanhas/${id}`);
  revalidatePath("/disparos");

  return { ok: true, scheduled, past };
}

export async function refineCampaignAction(
  campaignId: string,
  message: string,
): Promise<string> {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("Escreva o que você quer ajustar.");
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error("Campanha não encontrada.");
  const brandText = compileBrandKnowledge(await listBrandBlocks());

  // A âncora vem da receita (input is_anchor) + os valores da campanha. Necessária
  // para datar peças novas; a receita pode ter sido apagada (recipe_id null).
  const recipe = campaign.recipe_id ? await getRecipe(campaign.recipe_id) : null;
  const anchorLabel = recipe?.inputs.find((i) => i.is_anchor)?.label ?? "";
  const anchorValue = anchorLabel ? (campaign.inputs[anchorLabel] ?? "") : "";

  const result = await refineCampaign(campaign, trimmed, brandText, anchorLabel, anchorValue);

  const supabase = await createServerSupabase();

  // Persiste mensagem do usuário
  const { error: e1 } = await supabase.from("chat_messages").insert({
    campaign_id: campaignId,
    role: "user",
    content: trimmed,
  });
  if (e1) throw new Error(`Falha ao salvar mensagem do usuário: ${e1.message}`);

  // Aplica atualizações de toques por (campaign_id, sort_order)
  for (const touch of result.touch_updates) {
    const { sort_order, ...fields } = touch;
    const current = campaign.touches.find((t) => t.sort_order === sort_order);
    const mergedSteps = (fields.window_steps ?? []).map((w, i) => {
      const prev = current?.window_steps?.[i];
      return prev?.asset_id ? { ...w, asset_id: prev.asset_id } : w;
    });
    const { error } = await supabase
      .from("campaign_touches")
      .update({ ...fields, window_steps: mergedSteps })
      .eq("campaign_id", campaignId)
      .eq("sort_order", sort_order);
    if (error) throw new Error(`Falha ao atualizar toque ${sort_order}: ${error.message}`);
  }

  // Aplica atualizações de posts por (campaign_id, sort_order)
  for (const post of result.group_post_updates) {
    const { sort_order, ...fields } = post;
    const { error } = await supabase
      .from("campaign_group_posts")
      .update(fields)
      .eq("campaign_id", campaignId)
      .eq("sort_order", sort_order);
    if (error) throw new Error(`Falha ao atualizar post ${sort_order}: ${error.message}`);
  }

  // Peças novas precisam da âncora para datar; sem ela, não inserimos peça quebrada.
  const hasNew = result.new_touches.length > 0 || result.new_group_posts.length > 0;
  if (hasNew && !anchorValue) {
    throw new Error("Não consigo datar peças novas sem a âncora da campanha. Confira a receita.");
  }

  let addedTouches = 0;
  let addedPosts = 0;

  if (result.new_touches.length > 0) {
    let so = nextSortOrder(campaign.touches);
    const rows = result.new_touches.map((t) => {
      const { offset_days, offset_time, ...fields } = t;
      return {
        campaign_id: campaignId,
        sort_order: so++,
        ...fields,
        template_name: buildCode(recipe?.recipe_type ?? "", slugCode(t.role), anchorValue),
        send_at: computeSendAt(anchorValue, offset_days, offset_time),
      };
    });
    const { error } = await supabase.from("campaign_touches").insert(rows);
    if (error) throw new Error(`Falha ao adicionar toques: ${error.message}`);
    addedTouches = rows.length;
  }

  if (result.new_group_posts.length > 0) {
    const inheritedGroups = pickReferenceGroups(campaign.group_posts);
    let so = nextSortOrder(campaign.group_posts);
    const rows = result.new_group_posts.map((p) => {
      const { offset_days, offset_time, ...fields } = p;
      return {
        campaign_id: campaignId,
        sort_order: so++,
        ...fields,
        message_code: buildCode(recipe?.recipe_type ?? "", slugCode(p.role), anchorValue),
        send_at: computeSendAt(anchorValue, offset_days, offset_time),
      };
    });
    const { data: inserted, error } = await supabase
      .from("campaign_group_posts")
      .insert(rows)
      .select("id");
    if (error) throw new Error(`Falha ao adicionar posts: ${error.message}`);
    addedPosts = rows.length;

    const posts = inserted ?? [];
    if (inheritedGroups.length > 0 && posts.length > 0) {
      const links = posts.flatMap((row) =>
        inheritedGroups.map((community_id) => ({ post_id: row.id as string, community_id })),
      );
      const { error: eLink } = await supabase.from("campaign_group_post_communities").insert(links);
      if (eLink) throw new Error(`Falha ao vincular grupos das peças novas: ${eLink.message}`);
    }
  }

  // Selo factual: o que foi REALMENTE inserido, não o que a IA disse.
  const finalReply = formatAddedSeal(addedPosts, addedTouches) + result.reply;

  // Persiste reply do assistente
  const { error: e2 } = await supabase.from("chat_messages").insert({
    campaign_id: campaignId,
    role: "assistant",
    content: finalReply,
  });
  if (e2) throw new Error(`Falha ao salvar reply do assistente: ${e2.message}`);

  // O refino reescreve copy e mídia das peças; a fila carrega um snapshot delas.
  await rescheduleCampaign(campaignId);

  revalidatePath(`/campanhas/${campaignId}`);
  return finalReply;
}

export async function updateTouchAction(
  campaignId: string,
  sortOrder: number,
  fields: TouchFields,
): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("campaign_touches")
    .update(fields)
    .eq("campaign_id", campaignId)
    .eq("sort_order", sortOrder);
  if (error) throw new Error(`Falha ao atualizar toque: ${error.message}`);
  revalidatePath(`/campanhas/${campaignId}`);
}

export async function updateGroupPostAction(
  campaignId: string,
  sortOrder: number,
  fields: PostFields,
): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("campaign_group_posts")
    .update(fields)
    .eq("campaign_id", campaignId)
    .eq("sort_order", sortOrder);
  if (error) throw new Error(`Falha ao atualizar post: ${error.message}`);
  await rescheduleCampaign(campaignId);
  revalidatePath(`/campanhas/${campaignId}`);
}

export async function setTouchStepAssetAction(campaignId: string, sortOrder: number, stepIndex: number, assetId: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("campaign_touches").select("window_steps").eq("campaign_id", campaignId).eq("sort_order", sortOrder).single();
  if (error) throw new Error(`Falha ao carregar toque: ${error.message}`);
  const steps = ((data?.window_steps ?? []) as { media: string; caption: string; asset_id?: string }[]).map((s, i) => i === stepIndex ? (assetId ? { ...s, asset_id: assetId } : (() => { const { asset_id, ...rest } = s; return rest; })()) : s);
  const { error: e2 } = await supabase.from("campaign_touches").update({ window_steps: steps }).eq("campaign_id", campaignId).eq("sort_order", sortOrder);
  if (e2) throw new Error(`Falha ao anexar mídia: ${e2.message}`);
  revalidatePath(`/campanhas/${campaignId}`);
}

export type SendNowResult =
  | { ok: true; sent: number; failed: number; queued: number; skipped: number }
  | { ok: false; issues: ScheduleIssue[] };

/**
 * "Enviar agora": enfileira com scheduled_at = agora e chama o despachante inline.
 *
 * É a MESMA lib do cron — mesmo claim, mesmo log, mesmas travas (inclusive o botão
 * de pânico). O primeiro grupo sai em segundos; os demais nascem espaçados pelo
 * jitter e o cron os entrega nos minutos seguintes. Não pulamos o anti-ban só
 * porque o disparo é manual.
 */
export async function sendPieceNowAction(
  campaignId: string,
  postId: string,
): Promise<SendNowResult> {
  const { pieces } = await buildGroupPieces(campaignId);
  const piece = pieces.find((p) => p.post_id === postId);
  if (!piece) throw new Error("Peça não encontrada.");

  // send_at vazio => planSends agenda para agora. É o pedido, não a falta de uma data.
  const now = { ...piece, send_at: "" };

  const issues = validateSchedulable([now], { allowImmediate: true });
  if (issues.length > 0) return { ok: false, issues };

  const supabase = await createServerSupabase();

  // Desde que a campanha passou a montar a fila na geração, a peça JÁ ESTÁ enfileirada.
  // Inserir outra linha para o mesmo (post_id, wa_group_id) viola o índice único de
  // envios vivos — era o erro 23505 que estourava na tela. "Enviar agora" não insere
  // por cima: ele ANTECIPA o que já está lá.
  const { data: existing, error: eSel } = await supabase
    .from("scheduled_sends")
    .select("wa_group_id, status")
    .eq("post_id", postId);
  if (eSel) throw new Error(`Falha ao ler a fila da peça: ${eSel.message}`);

  // Grupo que já recebeu (ou está recebendo) não recebe de novo. É o mesmo cuidado do
  // índice único — só que agora a gente explica em vez de estourar.
  const jaSaiu = new Set(
    (existing ?? [])
      .filter((r) => r.status === "enviado" || r.status === "enviando")
      .map((r) => r.wa_group_id as string),
  );

  const alvos = now.targets.filter((t) => !jaSaiu.has(t.wa_group_id));
  const skipped = now.targets.length - alvos.length;

  if (alvos.length === 0) {
    return { ok: true, sent: 0, failed: 0, queued: 0, skipped };
  }

  // Apaga os pendentes desta peça e refaz: assim o payload leva a versão atual do texto
  // e da mídia, não um snapshot velho.
  const { error: eDel } = await supabase
    .from("scheduled_sends")
    .delete()
    .eq("post_id", postId)
    .eq("status", "pendente");
  if (eDel) throw new Error(`Falha ao limpar a fila da peça: ${eDel.message}`);

  const batchId = crypto.randomUUID();
  const rows = planSends([{ ...now, targets: alvos }]).map((s) => ({
    ...s,
    batch_id: batchId,
    campaign_id: campaignId,
    // Pula o portão da aprovação: alguém clicou em "Enviar agora" e confirmou o aviso.
    // Esse clique É a aprovação desta peça. Sem isto, numa campanha em rascunho o clique
    // não faria nada — o claim só entrega campanha aprovada.
    forced: true,
  }));

  const { data: inserted, error } = await supabase
    .from("scheduled_sends")
    .insert(rows)
    .select("id");
  if (error) throw new Error(`Falha ao enfileirar envio: ${error.message}`);

  // O despachante processa a fila inteira, não só o que acabei de inserir.
  const myIds = new Set((inserted ?? []).map((r) => r.id as string));
  const { results } = await dispatchDue();
  const mine = results.filter((r) => myIds.has(r.id));

  const sent = mine.filter((r) => r.ok).length;
  const failed = mine.filter((r) => !r.ok).length;

  revalidatePath(`/campanhas/${campaignId}`);
  revalidatePath("/disparos");

  return { ok: true, sent, failed, queued: Math.max(0, myIds.size - sent - failed), skipped };
}

/**
 * Editor em massa: sobrescreve os grupos de TODAS as peças da campanha.
 *
 * Não existe "grupo da campanha" persistido — a peça é a fonte de verdade. Isto aqui é
 * conveniência (escolher uma vez em vez de cinco), não herança. Por isso sobrescreve
 * mesmo quem tinha alvo customizado, e a UI avisa antes.
 */
export async function setCampaignCommunitiesAction(
  campaignId: string,
  communityIds: string[],
): Promise<void> {
  const supabase = await createServerSupabase();
  const { data: posts, error } = await supabase
    .from("campaign_group_posts")
    .select("id")
    .eq("campaign_id", campaignId);
  if (error) throw new Error(`Falha ao carregar posts: ${error.message}`);

  const ids = (posts ?? []).map((p) => p.id as string);
  if (ids.length === 0) return;

  const { error: eDel } = await supabase
    .from("campaign_group_post_communities")
    .delete()
    .in("post_id", ids);
  if (eDel) throw new Error(`Falha ao limpar grupos: ${eDel.message}`);

  if (communityIds.length > 0) {
    const rows = ids.flatMap((post_id) =>
      communityIds.map((community_id) => ({ post_id, community_id })),
    );
    const { error: eIns } = await supabase.from("campaign_group_post_communities").insert(rows);
    if (eIns) throw new Error(`Falha ao aplicar grupos: ${eIns.message}`);
  }

  await rescheduleCampaign(campaignId);
  revalidatePath(`/campanhas/${campaignId}`);
}

export async function setPostCommunitiesAction(
  campaignId: string,
  postId: string,
  communityIds: string[],
): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("campaign_group_post_communities")
    .delete()
    .eq("post_id", postId);
  if (error) throw new Error(`Falha ao limpar grupos do post: ${error.message}`);

  if (communityIds.length > 0) {
    const rows = communityIds.map((community_id) => ({ post_id: postId, community_id }));
    const { error: e2 } = await supabase.from("campaign_group_post_communities").insert(rows);
    if (e2) throw new Error(`Falha ao salvar grupos do post: ${e2.message}`);
  }
  await rescheduleCampaign(campaignId);
  revalidatePath(`/campanhas/${campaignId}`);
}

export async function setPostAssetAction(campaignId: string, sortOrder: number, assetId: string): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("campaign_group_posts").update({ asset_id: assetId || null }).eq("campaign_id", campaignId).eq("sort_order", sortOrder);
  if (error) throw new Error(`Falha ao anexar mídia: ${error.message}`);
  await rescheduleCampaign(campaignId);
  revalidatePath(`/campanhas/${campaignId}`);
}

/** Liga/desliga a prévia de link desta peça. Reprograma a fila: o payload leva o snapshot. */
export async function setPostLinkPreviewAction(
  campaignId: string,
  postId: string,
  value: boolean,
): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("campaign_group_posts")
    .update({ link_preview: value })
    .eq("id", postId);
  if (error) throw new Error(`Falha ao alterar a prévia de link: ${error.message}`);
  await rescheduleCampaign(campaignId);
  revalidatePath(`/campanhas/${campaignId}`);
}

export async function duplicateCampaignAction(campaignId: string, newAnchor: string, newName: string): Promise<string> {
  const src = await getCampaign(campaignId);
  if (!src) throw new Error("Campanha não encontrada.");
  const recipe = src.recipe_id ? await getRecipe(src.recipe_id) : null;

  const anchorLabel = recipe?.inputs.find((i) => i.is_anchor)?.label;
  const inputs = { ...src.inputs };
  if (anchorLabel && newAnchor) inputs[anchorLabel] = newAnchor;
  const anchorValue = anchorLabel ? (inputs[anchorLabel] ?? "") : "";
  const apiSlots = recipe?.slots.filter((s) => s.track === "api") ?? [];
  const gruposSlots = recipe?.slots.filter((s) => s.track === "grupos") ?? [];

  const supabase = await createServerSupabase();
  const { data: campaign, error } = await supabase.from("campaigns")
    .insert({ recipe_id: src.recipe_id, name: newName.trim() || `${src.name} (cópia)`, inputs })
    .select("id").single();
  if (error) throw new Error(`Falha ao duplicar campanha: ${error.message}`);
  const newId = campaign.id as string;

  try {
    if (src.touches.length > 0) {
      const { error: e1 } = await supabase.from("campaign_touches").insert(src.touches.map((t, idx) => ({
        campaign_id: newId, sort_order: t.sort_order,
        offset_label: t.offset_label, role: t.role, meta_category: t.meta_category,
        template_body: t.template_body, buttons: t.buttons, window_steps: t.window_steps,
        fallback_copy: t.fallback_copy, crm_action: t.crm_action, risk_flag: t.risk_flag,
        template_name: recipe ? buildCode(recipe.recipe_type, apiSlots[idx]?.code ?? "", anchorValue) : t.template_name,
        send_at: recipe ? computeSendAt(anchorValue, apiSlots[idx]?.offset_days ?? 0, apiSlots[idx]?.offset_time ?? "") : t.send_at,
      })));
      if (e1) throw new Error(`Falha ao duplicar toques: ${e1.message}`);
    }
    if (src.group_posts.length > 0) {
      const { data: newPosts, error: e2 } = await supabase.from("campaign_group_posts").insert(src.group_posts.map((p, idx) => ({
        campaign_id: newId, sort_order: p.sort_order,
        offset_label: p.offset_label, role: p.role, communities: p.communities,
        copy: p.copy, media: p.media, asset_id: p.asset_id, link_preview: p.link_preview,
        message_code: recipe ? buildCode(recipe.recipe_type, gruposSlots[idx]?.code ?? "", anchorValue) : p.message_code,
        send_at: recipe ? computeSendAt(anchorValue, gruposSlots[idx]?.offset_days ?? 0, gruposSlots[idx]?.offset_time ?? "") : p.send_at,
      }))).select("id, sort_order");
      if (e2) throw new Error(`Falha ao duplicar posts: ${e2.message}`);

      // A seleção de grupos vai junto: duplicar sem os alvos daria uma campanha inagendável.
      const newIdBySortOrder = new Map((newPosts ?? []).map((p) => [p.sort_order as number, p.id as string]));
      const links = src.group_posts.flatMap((p) => {
        const postId = newIdBySortOrder.get(p.sort_order);
        if (!postId) return [];
        return p.community_ids.map((community_id) => ({ post_id: postId, community_id }));
      });
      if (links.length > 0) {
        const { error: e3 } = await supabase.from("campaign_group_post_communities").insert(links);
        if (e3) throw new Error(`Falha ao duplicar grupos dos posts: ${e3.message}`);
      }
    }
  } catch (e) {
    // rollback compensatório: remove a cópia órfã antes de propagar o erro
    await supabase.from("campaigns").delete().eq("id", newId);
    throw e;
  }
  revalidatePath("/campanhas");
  return newId;
}
