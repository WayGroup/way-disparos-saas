import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/db/campaigns";
import { listChatMessages } from "@/lib/db/chat";
import { listAssets } from "@/lib/db/assets";
import { CampaignView } from "./_components/campaign-view";

// Refino e duplicação chamam a IA (~30-60s); evita timeout padrão (30s) no Vercel.
export const maxDuration = 300;

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaign, messages, assets] = await Promise.all([getCampaign(id), listChatMessages(id), listAssets()]);
  if (!campaign) notFound();
  return <CampaignView campaign={campaign} messages={messages} assets={assets} />;
}
