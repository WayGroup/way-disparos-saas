import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/db/campaigns";
import { listChatMessages } from "@/lib/db/chat";
import { listAssets } from "@/lib/db/assets";
import { listActiveGroups } from "@/lib/db/communities";
import { getRecipe } from "@/lib/db/recipes";
import { CampaignView } from "./_components/campaign-view";

// Refino e duplicação chamam a IA (~30-60s); evita timeout padrão (30s) no Vercel.
export const maxDuration = 300;

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaign, messages, assets, groups] = await Promise.all([
    getCampaign(id),
    listChatMessages(id),
    listAssets(),
    listActiveGroups(),
  ]);
  if (!campaign) notFound();

  // A âncora vive na receita (input is_anchor) cruzada com os valores da campanha. O
  // formulário de peça nova usa para mostrar a data resultante antes de salvar.
  const recipe = campaign.recipe_id ? await getRecipe(campaign.recipe_id) : null;
  const anchorLabel = recipe?.inputs.find((i) => i.is_anchor)?.label ?? "";
  const anchor = anchorLabel ? (campaign.inputs[anchorLabel] ?? "") : "";

  return <CampaignView campaign={campaign} messages={messages} assets={assets} groups={groups} anchor={anchor} />;
}
