export const REFINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "touch_updates", "group_post_updates", "new_touches", "new_group_posts"],
  properties: {
    reply: { type: "string" },
    touch_updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sort_order", "offset_label", "role", "meta_category", "template_body", "buttons", "window_steps", "fallback_copy", "crm_action", "risk_flag"],
        properties: {
          sort_order: { type: "integer" },
          offset_label: { type: "string" },
          role: { type: "string" },
          meta_category: { type: "string", enum: ["UTILITY", "MARKETING"] },
          template_body: { type: "string" },
          buttons: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type", "text", "url"],
              properties: {
                type: { type: "string", enum: ["quick_reply", "url"] },
                text: { type: "string" },
                url: { type: "string" },
              },
            },
          },
          window_steps: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["media", "caption"],
              properties: { media: { type: "string" }, caption: { type: "string" } },
            },
          },
          fallback_copy: { type: "string" },
          crm_action: { type: "string" },
          risk_flag: { type: "boolean" },
        },
      },
    },
    group_post_updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sort_order", "offset_label", "role", "communities", "copy", "media"],
        properties: {
          sort_order: { type: "integer" },
          offset_label: { type: "string" },
          role: { type: "string" },
          communities: { type: "string" },
          copy: { type: "string" },
          media: { type: "string" },
        },
      },
    },
    new_touches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["offset_label", "offset_days", "offset_time", "role", "meta_category", "template_body", "buttons", "window_steps", "fallback_copy", "crm_action", "risk_flag"],
        properties: {
          offset_label: { type: "string" },
          offset_days: { type: "integer" },
          offset_time: { type: "string" },
          role: { type: "string" },
          meta_category: { type: "string", enum: ["UTILITY", "MARKETING"] },
          template_body: { type: "string" },
          buttons: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type", "text", "url"],
              properties: {
                type: { type: "string", enum: ["quick_reply", "url"] },
                text: { type: "string" },
                url: { type: "string" },
              },
            },
          },
          window_steps: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["media", "caption"],
              properties: { media: { type: "string" }, caption: { type: "string" } },
            },
          },
          fallback_copy: { type: "string" },
          crm_action: { type: "string" },
          risk_flag: { type: "boolean" },
        },
      },
    },
    new_group_posts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["offset_label", "offset_days", "offset_time", "role", "communities", "copy", "media"],
        properties: {
          offset_label: { type: "string" },
          offset_days: { type: "integer" },
          offset_time: { type: "string" },
          role: { type: "string" },
          communities: { type: "string" },
          copy: { type: "string" },
          media: { type: "string" },
        },
      },
    },
  },
} as const;
