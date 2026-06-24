export const GENERATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["touches", "group_posts"],
  properties: {
    touches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["offset_label", "role", "meta_category", "template_body", "buttons", "window_steps", "fallback_copy", "crm_action", "risk_flag"],
        properties: {
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
    group_posts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["offset_label", "role", "communities", "copy", "media"],
        properties: {
          offset_label: { type: "string" },
          role: { type: "string" },
          communities: { type: "string" },
          copy: { type: "string" },
          media: { type: "string" },
        },
      },
    },
  },
} as const;
