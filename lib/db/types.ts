export type BrandBlock = {
  id: string;
  block_key: string;
  title: string;
  content: string;
  sort_order: number;
  updated_at: string;
};

export type Community = {
  id: string;
  name: string;
  identifier: string;
  sort_order: number;
  created_at: string;
};

export type Asset = {
  id: string;
  filename: string;
  storage_path: string;
  kind: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type Recipe = {
  id: string;
  name: string;
  description: string;
  recipe_type: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type RecipeInput = {
  id: string;
  recipe_id: string;
  label: string;
  field_type: string;
  required: boolean;
  is_anchor: boolean;
  sort_order: number;
};

export type RecipeSlot = {
  id: string;
  recipe_id: string;
  track: "api" | "grupos";
  code: string;
  offset_days: number;
  offset_time: string;
  offset_label: string;
  role: string;
  meta_category: "UTILITY" | "MARKETING" | null;
  target_communities: string | null;
  suggested_media: string;
  sort_order: number;
};

export type RecipeWithChildren = Recipe & {
  inputs: RecipeInput[];
  slots: RecipeSlot[];
};

export type Campaign = {
  id: string;
  recipe_id: string | null;
  name: string;
  inputs: Record<string, string>;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CampaignTouch = {
  id: string;
  campaign_id: string;
  sort_order: number;
  offset_label: string;
  template_name: string;
  role: string;
  meta_category: "UTILITY" | "MARKETING";
  template_body: string;
  buttons: { type: "quick_reply" | "url"; text: string; url: string }[];
  window_steps: { media: string; caption: string; asset_id?: string }[];
  fallback_copy: string;
  crm_action: string;
  risk_flag: boolean;
  send_at: string;
};

export type CampaignGroupPost = {
  id: string;
  campaign_id: string;
  sort_order: number;
  offset_label: string;
  message_code: string;
  role: string;
  communities: string;
  copy: string;
  media: string;
  send_at: string;
  asset_id: string | null;
};

export type CampaignWithContent = Campaign & {
  touches: CampaignTouch[];
  group_posts: CampaignGroupPost[];
};

export type ChatMessage = {
  id: string;
  campaign_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type StandardLink = {
  id: string;
  label: string;
  url: string;
  description: string;
  sort_order: number;
  created_at: string;
};
