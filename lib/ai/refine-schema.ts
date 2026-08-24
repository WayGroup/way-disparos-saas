// NOTA (grammar): a saída estruturada da Anthropic compila este schema numa grammar de
// decodificação restrita, que tem limite de tamanho. Este schema carrega o toque completo
// DUAS vezes (touch_updates E new_touches). Incluir "utility_alt" (objeto aninhado com um
// 2º array de botões) nos dois lugares estourou o limite ("compiled grammar is too large")
// e derrubava TODO refino em produção. Por isso o refino NÃO gerencia utility_alt: um
// update de toque preserva o utility_alt existente (não vem no payload → não sobrescreve) e
// um toque novo nasce sem alt. A GERAÇÃO (schema.ts) segue gerando utility_alt normalmente.
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
