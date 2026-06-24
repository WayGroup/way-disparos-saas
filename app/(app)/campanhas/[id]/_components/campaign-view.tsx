"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignWithContent, ChatMessage, Asset } from "@/lib/db/types";
import { approveCampaignAction } from "../../actions";
import { RefineChat } from "./refine-chat";
import { TouchCard } from "./touch-card";
import { PostCard } from "./post-card";

export function CampaignView({
  campaign,
  messages,
  assets,
}: {
  campaign: CampaignWithContent;
  messages: ChatMessage[];
  assets: Asset[];
}) {
  const router = useRouter();
  const [track, setTrack] = useState<"api" | "grupos">("api");
  const [approvePending, startApproveTransition] = useTransition();

  return (
    <div className="h-[calc(100vh-var(--nav-height,56px))] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-paper/90 backdrop-blur border-b border-line px-8 py-4 flex items-center justify-between shrink-0">
        <div>
          <button
            onClick={() => router.push("/campanhas")}
            className="font-mono text-xs text-muted hover:text-ink"
          >
            ← Campanhas
          </button>
          <h1 className="font-display font-bold text-2xl mt-0.5">{campaign.name}</h1>
          <div className="flex items-center gap-3 mt-1 font-mono text-xs text-muted">
            <span>{campaign.touches.length} toques</span>
            <span>·</span>
            <span>{campaign.group_posts.length} posts</span>
            <span>·</span>
            <span className={campaign.status === "aprovada" ? "text-emeraldd" : "text-risk"}>
              {campaign.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              startApproveTransition(async () => {
                await approveCampaignAction(campaign.id);
                router.refresh();
              })
            }
            disabled={approvePending || campaign.status === "aprovada"}
            className="rounded-lg bg-emerald hover:bg-emeraldd transition text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {campaign.status === "aprovada"
              ? "Aprovada ✓"
              : approvePending
                ? "Aprovando…"
                : "Aprovar campanha"}
          </button>
        </div>
      </header>

      {/* Two-column layout */}
      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: "1fr 360px" }}>
        {/* Left: cadence track */}
        <div className="overflow-y-auto p-8">
          {/* Tab switcher */}
          <div className="flex gap-1 bg-line/40 rounded-lg p-1 w-fit mb-5">
            <button
              onClick={() => setTrack("api")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                track === "api" ? "bg-white shadow-sm" : "text-muted"
              }`}
            >
              API individual{" "}
              <span className="font-mono text-xs text-muted">· {campaign.touches.length}</span>
            </button>
            <button
              onClick={() => setTrack("grupos")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                track === "grupos" ? "bg-white shadow-sm" : "text-muted"
              }`}
            >
              Grupos{" "}
              <span className="font-mono text-xs">· {campaign.group_posts.length}</span>
            </button>
          </div>

          {track === "api" ? (
            <div className="space-y-5 max-w-3xl">
              {campaign.touches.map((t) => (
                <TouchCard key={t.id} campaignId={campaign.id} touch={t} assets={assets} />
              ))}
            </div>
          ) : (
            <div className="space-y-5 max-w-3xl">
              {campaign.group_posts.map((p) => (
                <PostCard key={p.id} campaignId={campaign.id} post={p} assets={assets} />
              ))}
            </div>
          )}
        </div>

        {/* Right: refine chat panel */}
        <RefineChat campaignId={campaign.id} initialMessages={messages} />
      </div>
    </div>
  );
}
