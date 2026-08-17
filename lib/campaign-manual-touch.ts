import { derivarCampos } from "@/lib/campaign-piece-fields";

export type ManualTouchInput = {
  offset_label: string;
  role: string;
  meta_category: "UTILITY" | "MARKETING";
  template_body: string;
  /** Negativo = antes da âncora. */
  offset_days: number;
  /** "HH:mm". Vazio deixa o toque na hora da própria âncora. */
  offset_time: string;
};

export type ManualTouchDraft = {
  sort_order: number;
  offset_label: string;
  role: string;
  meta_category: "UTILITY" | "MARKETING";
  template_body: string;
  template_name: string;
  send_at: string;
};

/**
 * Monta a linha de um toque criado à mão.
 *
 * Os campos que a tabela preenche sozinha — buttons, window_steps, fallback_copy,
 * crm_action, risk_flag e utility_alt — não aparecem aqui de propósito: nascem vazios pelo
 * default do banco e se preenchem no editor, que já sabe editar todos eles. Repetir os
 * vazios aqui seria manter o schema em dois lugares.
 */
export function buildManualTouch(
  input: ManualTouchInput,
  ctx: { existing: { sort_order: number }[]; recipeType: string; anchor: string },
): ManualTouchDraft {
  const { sort_order, code, send_at } = derivarCampos(input, ctx);
  return {
    sort_order,
    offset_label: input.offset_label,
    role: input.role,
    meta_category: input.meta_category,
    template_body: input.template_body,
    template_name: code,
    send_at,
  };
}
