import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/db/campaigns";
import { CampaignView } from "./_components/campaign-view";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  return <CampaignView campaign={campaign} />;
}
