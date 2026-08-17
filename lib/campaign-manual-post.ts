import { buildCode } from "@/lib/ai/nomenclature";
import { computeSendAt } from "@/lib/schedule";
import { nextSortOrder, pickReferenceGroups, slugCode } from "@/lib/campaign-refine";

export type ManualPostInput = {
  offset_label: string;
  role: string;
  copy: string;
  media: string;
  /** Negativo = antes da âncora. */
  offset_days: number;
  /** "HH:mm". Vazio deixa a peça na hora da própria âncora. */
  offset_time: string;
};

export type ManualPostDraft = {
  sort_order: number;
  offset_label: string;
  role: string;
  communities: string;
  copy: string;
  media: string;
  message_code: string;
  send_at: string;
  community_ids: string[];
};

/**
 * Monta a linha de uma peça de grupo criada à mão.
 *
 * Não reimplementa nada: compõe os mesmos helpers que o chat de refino usa ao criar peça,
 * para que uma peça feita à mão seja indistinguível de uma peça da IA — mesma numeração,
 * mesmo padrão de código, mesma forma de datar.
 */
export function buildManualGroupPost(
  input: ManualPostInput,
  ctx: {
    existing: { sort_order: number; community_ids: string[] }[];
    recipeType: string;
    anchor: string;
  },
): ManualPostDraft {
  return {
    sort_order: nextSortOrder(ctx.existing),
    offset_label: input.offset_label,
    role: input.role,
    // `communities` é a sugestão em texto livre da IA. Peça à mão não tem sugestão, e
    // deixá-la vazia impede o casador de nomes de inventar alvo por conta própria.
    communities: "",
    copy: input.copy,
    media: input.media,
    message_code: buildCode(ctx.recipeType, slugCode(input.role), ctx.anchor),
    send_at: computeSendAt(ctx.anchor, input.offset_days, input.offset_time),
    community_ids: pickReferenceGroups(ctx.existing),
  };
}
