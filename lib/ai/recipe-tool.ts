export type RecipeDraftInput = {
  label: string;
  field_type: "texto" | "data_hora" | "url" | "link" | "links_multi";
  required: boolean;
  is_anchor: boolean;
};

export type RecipeDraftSlot = {
  track: "api" | "grupos";
  role: string;
  offset_days: number;
  offset_time: string;
  offset_minutes: number;
  meta_category: "UTILITY" | "MARKETING" | null;
  suggested_media: string;
  code: string;
};

export type RecipeDraft = {
  name: string;
  description: string;
  inputs: RecipeDraftInput[];
  slots: RecipeDraftSlot[];
};

/** Ferramenta que o copywriter chama para gerar um rascunho de receita. */
export const CRIAR_RECEITA_TOOL = {
  name: "criar_receita",
  description:
    "Cria um RASCUNHO de receita (modelo reutilizável de campanha) a partir do que foi conversado. " +
    "Use SOMENTE quando a pessoa pedir para montar/gerar uma receita. Receita é o ESQUELETO (inputs + slots), " +
    "sem copy. Exatamente um input é a âncora (field_type data_hora, a data do evento). Os offsets dos slots " +
    "seguem o modelo relativo: offset_days + hora fixa em offset_time (HH:mm), OU offset_time vazio e um " +
    "offset_minutes a partir da hora do evento (negativo = antes). A receita nasce como rascunho a revisar.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["name", "description", "inputs", "slots"],
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      inputs: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "field_type", "required", "is_anchor"],
          properties: {
            label: { type: "string" },
            field_type: { type: "string", enum: ["texto", "data_hora", "url", "link", "links_multi"] },
            required: { type: "boolean" },
            is_anchor: { type: "boolean" },
          },
        },
      },
      slots: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["track", "role", "offset_days", "offset_time", "offset_minutes", "meta_category", "suggested_media", "code"],
          properties: {
            track: { type: "string", enum: ["api", "grupos"] },
            role: { type: "string" },
            offset_days: { type: "integer" },
            offset_time: { type: "string" },
            offset_minutes: { type: "integer" },
            meta_category: { type: ["string", "null"], enum: ["UTILITY", "MARKETING", null] },
            suggested_media: { type: "string" },
            code: { type: "string" },
          },
        },
      },
    },
  },
} as const;

/** Regras semânticas que o input_schema não cobre. A mensagem é para o modelo corrigir. */
export function validateRecipeDraft(
  draft: RecipeDraft,
): { ok: true } | { ok: false; error: string } {
  if (draft.inputs.length === 0) {
    return { ok: false, error: "A receita precisa de ao menos um input — no mínimo a data do evento, que é a âncora." };
  }
  const anchors = draft.inputs.filter((i) => i.is_anchor);
  if (anchors.length !== 1) {
    return { ok: false, error: `A receita precisa de EXATAMENTE uma âncora (is_anchor: true); recebi ${anchors.length}. A âncora é a data do evento.` };
  }
  if (anchors[0].field_type !== "data_hora") {
    return { ok: false, error: "A âncora precisa ser do tipo data_hora (a data e hora do evento)." };
  }
  if (draft.slots.length === 0) {
    return { ok: false, error: "A receita precisa de ao menos um slot (uma peça de campanha)." };
  }
  if (draft.slots.some((s) => s.track === "api" && !s.meta_category)) {
    return { ok: false, error: "Todo slot da trilha api precisa de meta_category (UTILITY ou MARKETING)." };
  }
  return { ok: true };
}

/** Mapeia o draft para o payload do save_recipe (objetos planos, com defaults). */
export function toSaveRecipePayload(draft: RecipeDraft): {
  inputs: { label: string; field_type: string; required: boolean; is_anchor: boolean }[];
  slots: {
    track: "api" | "grupos"; code: string; role: string;
    meta_category: "UTILITY" | "MARKETING" | null; target_communities: null;
    suggested_media: string; offset_days: number; offset_time: string;
    offset_minutes: number; offset_label: string;
  }[];
} {
  return {
    inputs: draft.inputs.map((i) => ({
      label: i.label, field_type: i.field_type, required: i.required, is_anchor: i.is_anchor,
    })),
    slots: draft.slots.map((s) => ({
      track: s.track,
      code: s.code ?? "",
      role: s.role,
      // meta_category só existe na trilha api; grupos sempre null.
      meta_category: s.track === "api" ? s.meta_category : null,
      target_communities: null,
      suggested_media: s.suggested_media ?? "",
      offset_days: s.offset_days,
      offset_time: s.offset_time ?? "",
      offset_minutes: s.offset_minutes ?? 0,
      offset_label: "",
    })),
  };
}

/** Selo factual da(s) receita(s) criada(s), com o caminho do editor. "" se nada foi criado. */
export function formatRecipeSeal(recipes: { id: string; name: string }[]): string {
  if (recipes.length === 0) return "";
  return recipes
    .map((r) => `✓ Rascunho de receita criado: "${r.name}". Abra em /receitas/${r.id} para revisar e ativar.`)
    .join("\n");
}
