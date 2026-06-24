"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RecipeWithChildren } from "@/lib/db/types";
import { saveRecipeAction, deleteRecipeAction, type SaveInput, type SaveSlot } from "../../actions";

type Track = "api" | "grupos";

export function RecipeEditor({ recipe }: { recipe: RecipeWithChildren }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(recipe.name);
  const [description, setDescription] = useState(recipe.description);
  const [active, setActive] = useState(recipe.active);
  const [track, setTrack] = useState<Track>("api");

  const [inputs, setInputs] = useState<SaveInput[]>(
    recipe.inputs.map((i) => ({ label: i.label, field_type: i.field_type, required: i.required, is_anchor: i.is_anchor })),
  );
  const [slots, setSlots] = useState<SaveSlot[]>(
    recipe.slots.map((s) => ({
      track: s.track, offset_label: s.offset_label, code: s.code, role: s.role,
      meta_category: s.meta_category, target_communities: s.target_communities, suggested_media: s.suggested_media,
      offset_days: s.offset_days, offset_time: s.offset_time,
    })),
  );

  function patchInput(idx: number, patch: Partial<SaveInput>) {
    setInputs((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function patchSlot(globalIdx: number, patch: Partial<SaveSlot>) {
    setSlots((prev) => prev.map((s, i) => (i === globalIdx ? { ...s, ...patch } : s)));
  }

  const trackSlots = slots
    .map((s, idx) => ({ s, idx }))
    .filter((x) => x.s.track === track);

  function save() {
    startTransition(async () => {
      await saveRecipeAction(recipe.id, { name, description, active, inputs, slots });
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Remover a receita "${name}"?`)) return;
    startTransition(async () => {
      await deleteRecipeAction(recipe.id);
      router.push("/receitas");
    });
  }

  return (
    <div className="p-8 max-w-5xl">
      <button onClick={() => router.push("/receitas")} className="font-mono text-xs text-muted hover:text-ink">← Receitas</button>
      <header className="flex items-end justify-between mt-1 mb-6">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted">Editar receita</div>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="font-display font-bold text-3xl mt-1 bg-transparent border-b border-dashed border-line focus:border-emerald outline-none" />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-emerald" /> ativa
          </label>
          <button onClick={save} disabled={pending}
            className="rounded-lg bg-emerald hover:bg-emeraldd transition text-white text-sm font-semibold px-4 py-2.5 disabled:opacity-50">
            {pending ? "Salvando..." : "Salvar receita"}
          </button>
        </div>
      </header>

      <label className="block mb-8">
        <span className="text-xs font-mono uppercase tracking-wide text-muted">Descrição</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-lg border border-line p-2.5 text-sm" />
      </label>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-lg">Inputs da campanha</h2>
          <span className="font-mono text-xs text-muted">campos que o time preenche a cada campanha</span>
        </div>
        <div className="rounded-xl border border-line bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-paper text-muted font-mono text-xs uppercase">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Campo</th>
                <th className="text-left font-medium px-4 py-2.5">Tipo</th>
                <th className="text-left font-medium px-4 py-2.5">Obrigatório</th>
                <th className="text-left font-medium px-4 py-2.5">Âncora</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {inputs.map((it, idx) => (
                <tr key={idx} className={it.is_anchor ? "bg-emerald/5" : ""}>
                  <td className="px-4 py-2.5"><input value={it.label} onChange={(e) => patchInput(idx, { label: e.target.value })} className="w-full bg-transparent outline-none" /></td>
                  <td className="px-4 py-2.5">
                    <select value={it.field_type} onChange={(e) => patchInput(idx, { field_type: e.target.value })} className="bg-transparent outline-none font-mono text-xs">
                      <option value="texto">texto</option>
                      <option value="data_hora">data/hora</option>
                      <option value="url">url</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5"><input type="checkbox" checked={it.required} onChange={(e) => patchInput(idx, { required: e.target.checked })} className="accent-emerald" /></td>
                  <td className="px-4 py-2.5"><input type="checkbox" checked={it.is_anchor} onChange={(e) => patchInput(idx, { is_anchor: e.target.checked })} className="accent-emerald" /></td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => setInputs((p) => p.filter((_, i) => i !== idx))} className="text-xs text-muted hover:text-risk">remover</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setInputs((p) => [...p, { label: "Novo campo", field_type: "texto", required: true, is_anchor: false }])}
            className="w-full border-t border-dashed border-line py-3 text-sm text-muted hover:text-ink2 transition">+ Adicionar campo</button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-lg">Slots de toque</h2>
          <span className="font-mono text-xs text-muted">o esqueleto que a IA preenche</span>
        </div>
        <div className="flex gap-1 bg-line/40 rounded-lg p-1 w-fit mb-4">
          <button onClick={() => setTrack("api")} className={`rounded-md px-4 py-1.5 text-sm font-medium ${track === "api" ? "bg-white shadow-sm" : "text-muted"}`}>API individual</button>
          <button onClick={() => setTrack("grupos")} className={`rounded-md px-4 py-1.5 text-sm font-medium ${track === "grupos" ? "bg-white shadow-sm" : "text-muted"}`}>Grupos</button>
        </div>

        <div className="space-y-3">
          {trackSlots.map(({ s, idx }) => (
            <div key={idx} className="rounded-xl border border-line bg-white p-4 flex items-start gap-4">
              <div className="grid grid-cols-12 gap-3 flex-1 items-end">
                <label className="col-span-1"><span className="text-[10px] font-mono uppercase text-muted">Offset</span>
                  <input value={s.offset_label} onChange={(e) => patchSlot(idx, { offset_label: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                <label className="col-span-1"><span className="text-[10px] font-mono uppercase text-muted">Código</span>
                  <input value={s.code} onChange={(e) => patchSlot(idx, { code: e.target.value })} placeholder="ex.: convite" className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" /></label>
                <label className="col-span-4"><span className="text-[10px] font-mono uppercase text-muted">Papel / objetivo</span>
                  <input value={s.role} onChange={(e) => patchSlot(idx, { role: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                {track === "api" ? (
                  <label className="col-span-2"><span className="text-[10px] font-mono uppercase text-muted">Categoria Meta</span>
                    <select value={s.meta_category ?? "UTILITY"} onChange={(e) => patchSlot(idx, { meta_category: e.target.value as "UTILITY" | "MARKETING" })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm">
                      <option value="UTILITY">UTILITY</option>
                      <option value="MARKETING">MARKETING</option>
                    </select></label>
                ) : (
                  <label className="col-span-2"><span className="text-[10px] font-mono uppercase text-muted">Comunidades</span>
                    <input value={s.target_communities ?? ""} onChange={(e) => patchSlot(idx, { target_communities: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                )}
                <label className="col-span-2"><span className="text-[10px] font-mono uppercase text-muted">Mídia sugerida</span>
                  <input value={s.suggested_media} onChange={(e) => patchSlot(idx, { suggested_media: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                <label className="col-span-1"><span className="text-[10px] font-mono uppercase text-muted">Dias</span>
                  <input type="number" value={s.offset_days} onChange={(e) => patchSlot(idx, { offset_days: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                <label className="col-span-1"><span className="text-[10px] font-mono uppercase text-muted">Hora</span>
                  <input value={s.offset_time} onChange={(e) => patchSlot(idx, { offset_time: e.target.value })} placeholder="14:00" className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" /></label>
              </div>
              <button onClick={() => setSlots((p) => p.filter((_, i) => i !== idx))} className="text-xs text-muted hover:text-risk pt-5">remover</button>
            </div>
          ))}
          <button
            onClick={() => setSlots((p) => [...p, track === "api"
              ? { track: "api", offset_label: "0", code: "", role: "Novo toque", meta_category: "UTILITY", target_communities: null, suggested_media: "", offset_days: 0, offset_time: "" }
              : { track: "grupos", offset_label: "0", code: "", role: "Novo post", meta_category: null, target_communities: "1, 2, 3", suggested_media: "", offset_days: 0, offset_time: "" }])}
            className="rounded-lg border border-dashed border-line w-full py-3 text-sm text-muted hover:text-ink2 transition">
            + Adicionar slot {track === "api" ? "de API" : "de grupo"}
          </button>
        </div>
      </div>

      <div className="mt-10 pt-6 border-t border-line">
        <button onClick={remove} disabled={pending} className="text-sm text-risk hover:underline disabled:opacity-50">Remover esta receita</button>
      </div>
    </div>
  );
}
