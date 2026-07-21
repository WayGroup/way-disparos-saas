"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RecipeWithChildren } from "@/lib/db/types";
import { saveRecipeAction, deleteRecipeAction, type SaveInput, type SaveSlot } from "../../actions";
import { formatOffsetLabel, codeFromRole, nextSlotDefaults, padTime, splitOffsetMinutes, joinOffsetMinutes, isLegacyAutoLabel } from "@/lib/recipe-slots";

type Track = "api" | "grupos";
type SlotMode = "fixa" | "antes" | "depois";

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
      // padTime: o <input type="time"> renderiza vazio se a hora vier "9:00" (sem zero
      // à esquerda), enquanto o agendador dispara às 09:00 — normalizar evita essa mentira.
      offset_days: s.offset_days, offset_time: padTime(s.offset_time), offset_minutes: s.offset_minutes ?? 0,
    })),
  );

  // O modo escolhido NÃO pode ser derivado só do dado: com deslocamento zero, "depois"
  // e "antes" colapsam (+0 === -0), o select voltaria sozinho para "antes" e o próximo
  // número digitado sairia com o sinal invertido. Guardamos a escolha da pessoa.
  const [modeOverride, setModeOverride] = useState<Record<number, SlotMode>>({});

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
    // O rótulo é sempre derivado (nunca digitado) e o código cai no slug do papel
    // quando a pessoa não escreve um próprio.
    const normalized = slots.map((s, i) => ({
      ...s,
      offset_label: formatOffsetLabel(s.offset_days, s.offset_time, s.offset_minutes),
      // Papel vazio geraria código vazio — e dois deles colidiriam no mesmo template_name.
      code: s.code.trim() || codeFromRole(s.role) || `slot-${i + 1}`,
    }));
    // O Salvar é global, mas o hint "era: …" só aparece na aba aberta. Sem este aviso,
    // salvar de uma aba apagaria em silêncio os rótulos legados da outra.
    // Rótulos que o próprio sistema derivou antes (só a parte do dia, ex. "D0") não
    // contam: não há redação humana a perder ali, e avisar sobre eles seria falso alarme
    // em toda receita legada — o que treinaria a pessoa a ignorar o aviso que importa.
    const achatados = slots.filter((s) => {
      const derived = formatOffsetLabel(s.offset_days, s.offset_time, s.offset_minutes);
      return s.offset_label && s.offset_label !== derived && !isLegacyAutoLabel(s.offset_label);
    }).length;
    if (
      achatados > 0 &&
      !confirm(
        `${achatados} slot(s) ainda têm um rótulo antigo, escrito à mão, que não bate com o Quando ` +
          `(inclusive em outras trilhas). Quem agenda é o Quando — salvar substitui esses rótulos ` +
          `pelo derivado e a redação original se perde. Continuar?`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      await saveRecipeAction(recipe.id, { name, description, active, inputs, slots: normalized });
      // O estado precisa espelhar o que foi gravado: sem isto, um segundo save
      // rederivaria o código a partir de um papel já editado e o renomearia em silêncio.
      setSlots(normalized);
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
          {trackSlots.map(({ s, idx }, i) => {
            const derived = formatOffsetLabel(s.offset_days, s.offset_time, s.offset_minutes);
            const derivedMode: SlotMode = s.offset_time ? "fixa" : s.offset_minutes > 0 ? "depois" : "antes";
            // A escolha explícita manda; a derivação é só o ponto de partida.
            const mode: SlotMode = modeOverride[idx] ?? derivedMode;
            const rel = splitOffsetMinutes(s.offset_minutes);
            const sign: "antes" | "depois" = mode === "depois" ? "depois" : "antes";
            const staleLabel = !!s.offset_label && s.offset_label !== derived && !isLegacyAutoLabel(s.offset_label);
            return (
            <div key={idx} className="rounded-xl border border-line bg-white p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-xs text-muted">#{i + 1}</span>
                  <span className="rounded-full bg-emerald/10 text-emeraldd font-mono text-xs px-2.5 py-1">{derived}</span>
                  {staleLabel && (
                    <span
                      className="font-mono text-xs text-risk"
                      title="Rótulo antigo, escrito à mão, que não bate com o Quando — quem agenda são estes campos. Ajuste-os; ao salvar, este rótulo é substituído."
                    >
                      era: {s.offset_label}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    // Os índices deslocam ao remover. Remapeamos as escolhas em vez de
                    // zerá-las: limpar reabriria a inversão de sinal nos outros slots.
                    setModeOverride((m) =>
                      Object.fromEntries(
                        Object.entries(m)
                          .filter(([k]) => Number(k) !== idx)
                          .map(([k, v]) => [Number(k) > idx ? Number(k) - 1 : Number(k), v]),
                      ),
                    );
                    setSlots((p) => p.filter((_, j) => j !== idx));
                  }}
                  className="text-xs text-muted hover:text-risk"
                >remover</button>
              </div>

              <div className="grid grid-cols-12 gap-3 items-end">
                <label className="col-span-12"><span className="text-[10px] font-mono uppercase text-muted">Papel / objetivo</span>
                  <input value={s.role} onChange={(e) => patchSlot(idx, { role: e.target.value })} placeholder="ex.: Convite — reserve sua vaga" className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
              </div>

              <div className="grid grid-cols-12 gap-3 items-end mt-3">
                <label className="col-span-3"><span className="text-[10px] font-mono uppercase text-muted">Dias</span>
                  <input type="number" value={s.offset_days} onChange={(e) => patchSlot(idx, { offset_days: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                <label className="col-span-4"><span className="text-[10px] font-mono uppercase text-muted">Quando</span>
                  <select
                    value={mode}
                    onChange={(e) => {
                      const v = e.target.value as SlotMode;
                      setModeOverride((m) => ({ ...m, [idx]: v }));
                      if (v === "fixa") patchSlot(idx, { offset_time: s.offset_time || "10:00" });
                      else patchSlot(idx, { offset_time: "", offset_minutes: joinOffsetMinutes(v, rel.hours, rel.minutes) });
                    }}
                    className="mt-1 w-full rounded-lg border border-line p-2 text-sm"
                  >
                    <option value="fixa">hora fixa</option>
                    <option value="antes">antes do evento</option>
                    <option value="depois">depois do evento</option>
                  </select></label>
                <div className="col-span-5 flex gap-3 items-end">
                  {mode === "fixa" ? (
                    <label className="flex-1"><span className="text-[10px] font-mono uppercase text-muted">Hora</span>
                      <input type="time" value={s.offset_time} onChange={(e) => patchSlot(idx, { offset_time: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" /></label>
                  ) : (
                    <>
                      <label className="flex-1"><span className="text-[10px] font-mono uppercase text-muted">Horas</span>
                        <input type="number" min={0} value={rel.hours} onChange={(e) => patchSlot(idx, { offset_minutes: joinOffsetMinutes(sign, Number(e.target.value), rel.minutes) })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                      <label className="flex-1"><span className="text-[10px] font-mono uppercase text-muted">Minutos</span>
                        <input type="number" min={0} value={rel.minutes} onChange={(e) => patchSlot(idx, { offset_minutes: joinOffsetMinutes(sign, rel.hours, Number(e.target.value)) })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-12 gap-3 items-end mt-3">
                <label className={track === "api" ? "col-span-6" : "col-span-9"}><span className="text-[10px] font-mono uppercase text-muted">Mídia sugerida</span>
                  <input value={s.suggested_media} onChange={(e) => patchSlot(idx, { suggested_media: e.target.value })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm" /></label>
                {track === "api" && (
                  <label className="col-span-3"><span className="text-[10px] font-mono uppercase text-muted">Categoria Meta</span>
                    <select value={s.meta_category ?? "UTILITY"} onChange={(e) => patchSlot(idx, { meta_category: e.target.value as "UTILITY" | "MARKETING" })} className="mt-1 w-full rounded-lg border border-line p-2 text-sm">
                      <option value="UTILITY">UTILITY</option>
                      <option value="MARKETING">MARKETING</option>
                    </select></label>
                )}
                <label className="col-span-3"><span className="text-[10px] font-mono uppercase text-muted">Código</span>
                  <input value={s.code} onChange={(e) => patchSlot(idx, { code: e.target.value })} placeholder={codeFromRole(s.role) || "auto"} className="mt-1 w-full rounded-lg border border-line p-2 text-sm font-mono" /></label>
              </div>
            </div>
            );
          })}
          <button
            onClick={() =>
              setSlots((p) => {
                const lastOfTrack = [...p].reverse().find((x) => x.track === track);
                const when = nextSlotDefaults(lastOfTrack);
                return [
                  ...p,
                  track === "api"
                    ? { track: "api" as const, offset_label: formatOffsetLabel(when.offset_days, when.offset_time, when.offset_minutes), code: "", role: "Novo toque", meta_category: "UTILITY" as const, target_communities: null, suggested_media: "", ...when }
                    : { track: "grupos" as const, offset_label: formatOffsetLabel(when.offset_days, when.offset_time, when.offset_minutes), code: "", role: "Novo post", meta_category: null, target_communities: null, suggested_media: "", ...when },
                ];
              })
            }
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
