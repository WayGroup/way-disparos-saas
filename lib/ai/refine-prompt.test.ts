import { describe, it, expect } from "vitest";
import { buildRefinePrompt } from "@/lib/ai/refine-prompt";
import type { CampaignWithContent } from "@/lib/db/types";

const campaign: CampaignWithContent = {
  id: "c", recipe_id: "r", name: "Webinário 27/06", inputs: { Tema: "Amazon do zero" },
  status: "rascunho", created_at: "", updated_at: "",
  touches: [
    { id: "t1", campaign_id: "c", sort_order: 0, offset_label: "-3 dias", role: "Convite", template_name: "", meta_category: "UTILITY", template_body: "Oi {{1}}", buttons: ["Quero o link"], window_steps: [{ media: "Vídeo", caption: "boas-vindas" }], fallback_copy: "Tranquilo", crm_action: "tag inscrito", risk_flag: false, send_at: "" },
  ],
  group_posts: [
    { id: "p1", campaign_id: "c", sort_order: 0, offset_label: "-3 dias", role: "Convite", message_code: "", communities: "1, 2, 3", copy: "Galera", media: "Vídeo convite", send_at: "", asset_id: null },
  ],
};

describe("buildRefinePrompt", () => {
  it("inclui base, estado atual (toques/posts com sort_order) e o pedido do usuário", () => {
    const out = buildRefinePrompt(campaign, "reescreve o toque 1 mais agressivo", "BASE_WAY");
    expect(out).toContain("BASE_WAY");
    expect(out).toContain("reescreve o toque 1 mais agressivo");
    expect(out).toContain("Oi {{1}}"); // estado atual do toque
    expect(out).toContain("Galera"); // estado atual do post
    expect(out).toContain("API"); // identifica a trilha
    expect(out).toMatch(/sort_order.*0/s);
  });
});
