import { buildCode } from "@/lib/ai/nomenclature";
import { computeSendAt } from "@/lib/schedule";
import { nextSortOrder, slugCode } from "@/lib/campaign-refine";

/**
 * Os três campos que toda peça criada à mão deriva do contexto da campanha, iguais nas
 * duas trilhas: onde ela entra na ordem, o código que a identifica, e quando ela sai.
 *
 * Mora num arquivo próprio, e não dentro de um dos dois construtores, para que nenhum dos
 * dois precise importar do outro. São as mesmas derivações que o chat de refino usa ao
 * criar peça — é isso que torna uma peça feita à mão indistinguível de uma da IA.
 */
/**
 * Resolve o valor da âncora da campanha: acha, na receita, o input marcado como
 * `is_anchor`, e busca o valor correspondente nos inputs da campanha.
 *
 * Devolve "" quando não há receita (foi apagada — `campaign.recipe_id` vira null e o
 * fallback do resto do código segue em frente sem data), quando nenhum input é âncora,
 * ou quando a campanha não tem valor preenchido para aquele input. Nos três casos o
 * resultado é o mesmo "sem âncora, sem data" que o resto do fluxo já trata.
 *
 * Era a mesma derivação de duas linhas copiada em cinco lugares de `actions.ts` — a
 * convenção do `is_anchor` mora só aqui agora.
 */
export function resolverAncora(
  campaign: { inputs: Record<string, string> },
  recipe: { inputs: { label: string; is_anchor: boolean }[] } | null,
): string {
  const anchorLabel = recipe?.inputs.find((i) => i.is_anchor)?.label ?? "";
  return anchorLabel ? (campaign.inputs[anchorLabel] ?? "") : "";
}

export function derivarCampos(
  input: { role: string; offset_days: number; offset_time: string },
  ctx: { existing: { sort_order: number }[]; recipeType: string; anchor: string },
): { sort_order: number; code: string; send_at: string } {
  return {
    sort_order: nextSortOrder(ctx.existing),
    code: buildCode(ctx.recipeType, slugCode(input.role), ctx.anchor),
    send_at: computeSendAt(ctx.anchor, input.offset_days, input.offset_time),
  };
}
