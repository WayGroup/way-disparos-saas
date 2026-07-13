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
  /** JID do grupo no WhatsApp (…@g.us). Null enquanto não sincronizado com a Evolution. */
  wa_group_id: string | null;
  /** Nome do grupo como está no WhatsApp. Pode vir vazio. */
  wa_subject: string;
  active: boolean;
  synced_at: string | null;
};

export type AppSettings = {
  id: boolean;
  sends_paused: boolean;
  paused_reason: string;
  updated_at: string;
};

export type SendStatus = "pendente" | "enviando" | "enviado" | "falhou" | "cancelado";

export type ScheduledSend = {
  id: string;
  batch_id: string;
  campaign_id: string | null;
  post_id: string | null;
  community_id: string | null;
  wa_group_id: string;
  wa_subject: string;
  scheduled_at: string;
  next_attempt_at: string | null;
  status: SendStatus;
  attempts: number;
  last_error: string;
  claimed_at: string | null;
  sent_at: string | null;
  wa_message_id: string | null;
  payload: { text: string; media: { url: string; mediatype: string; mimetype: string; fileName: string } | null };
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
  /** Grupos reais escolhidos para o disparo. `communities` acima é só a sugestão da IA. */
  community_ids: string[];
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

export type CopyChat = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type CopyMessage = {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  attachments: { kind: "image" | "pdf"; storage_path: string; mime_type: string; filename: string }[];
  created_at: string;
};
