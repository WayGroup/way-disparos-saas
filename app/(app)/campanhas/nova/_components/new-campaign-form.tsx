"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RecipeWithChildren, StandardLink } from "@/lib/db/types";
import { generateCampaignAction } from "../../actions";

export function NewCampaignForm({ recipes, links }: { recipes: RecipeWithChildren[]; links: StandardLink[] }) {
  const router = useRouter();
  const [recipeId, setRecipeId] = useState(recipes[0]?.id ?? "");
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [customMode, setCustomMode] = useState<Record<string, boolean>>({});
  const [multiSel, setMultiSel] = useState<Record<string, Set<string>>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const recipe = recipes.find((r) => r.id === recipeId);

  function generate() {
    if (!recipe) return;
    setError(null);
    startTransition(async () => {
      try {
        const id = await generateCampaignAction(recipe.id, name, values);
        router.push(`/campanhas/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao gerar campanha.");
      }
    });
  }

  if (recipes.length === 0) {
    return <p className="text-muted">Nenhuma receita ativa. Crie uma em Receitas primeiro.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {recipes.map((r) => (
          <button key={r.id} onClick={() => { setRecipeId(r.id); setValues({}); setCustomMode({}); setMultiSel({}); }}
            className={`text-left rounded-xl border-2 bg-white p-5 transition ${recipeId === r.id ? "border-emerald ring-2 ring-emerald/20" : "border-line hover:border-ink2"}`}>
            <div className="font-display font-bold text-lg">{r.name}</div>
            <p className="text-sm text-muted mt-1">{r.description}</p>
          </button>
        ))}
      </div>

      {recipe && (
        <div className="rounded-xl border border-line bg-white p-6 space-y-4">
          <label className="block">
            <span className="text-xs font-mono uppercase tracking-wide text-muted">Nome interno</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={recipe.name}
              className="mt-1 w-full rounded-lg border border-line p-2.5 text-sm" />
          </label>
          {recipe.inputs.map((i) => {
            if (i.field_type === "links_multi") {
              const savedLinks = links.filter((l) => l.url);
              const selected = multiSel[i.label] ?? new Set<string>();
              function toggle(link: StandardLink) {
                const next = new Set(selected);
                if (next.has(link.id)) next.delete(link.id); else next.add(link.id);
                const chosen = savedLinks.filter((l) => next.has(l.id));
                setMultiSel((prev) => ({ ...prev, [i.label]: next }));
                setValues((v) => ({ ...v, [i.label]: chosen.map((l) => `${l.label}: ${l.url}`).join("\n") }));
              }
              return (
                <div key={i.id} className="block">
                  <span className="text-xs font-mono uppercase tracking-wide text-muted">{i.label}</span>
                  {savedLinks.length === 0 ? (
                    <p className="mt-1 text-xs text-muted">Nenhum link salvo com URL. Cadastre em Links primeiro.</p>
                  ) : (
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      {savedLinks.map((l) => (
                        <label key={l.id} className={`flex items-center gap-2 rounded-lg border p-2.5 text-sm cursor-pointer transition ${selected.has(l.id) ? "border-emerald bg-emerald/5" : "border-line hover:border-ink2"}`}>
                          <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l)} className="accent-emerald" />
                          <span className="truncate">{l.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            if (i.field_type === "link") {
              const savedLinks = links.filter((l) => l.url);
              const current = values[i.label] ?? "";
              const isCustom = customMode[i.label] || (current !== "" && !savedLinks.some((l) => l.url === current));
              return (
                <label key={i.id} className="block">
                  <span className="text-xs font-mono uppercase tracking-wide text-muted">{i.label}{i.is_anchor ? " ⚓ (âncora da cadência)" : ""}</span>
                  <select
                    value={isCustom ? "__custom__" : current}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__custom__") {
                        setCustomMode((m) => ({ ...m, [i.label]: true }));
                        setValues((prev) => ({ ...prev, [i.label]: "" }));
                      } else {
                        setCustomMode((m) => ({ ...m, [i.label]: false }));
                        setValues((prev) => ({ ...prev, [i.label]: v }));
                      }
                    }}
                    className="mt-1 w-full rounded-lg border border-line bg-white p-2.5 text-sm outline-none focus:border-emerald"
                  >
                    <option value="">— escolher link salvo —</option>
                    {savedLinks.map((l) => (
                      <option key={l.id} value={l.url}>{l.label}</option>
                    ))}
                    <option value="__custom__">Outro (colar URL)…</option>
                  </select>
                  {isCustom && (
                    <input
                      type="url" value={current} placeholder="https://…"
                      onChange={(e) => setValues((prev) => ({ ...prev, [i.label]: e.target.value }))}
                      className="mt-2 w-full rounded-lg border border-line p-2.5 text-sm outline-none focus:border-emerald"
                    />
                  )}
                </label>
              );
            }
            const inputType = i.field_type === "data_hora" ? "datetime-local" : i.field_type === "url" ? "url" : "text";
            return (
              <label key={i.id} className="block">
                <span className="text-xs font-mono uppercase tracking-wide text-muted">{i.label}{i.is_anchor ? " ⚓ (âncora da cadência)" : ""}</span>
                <input
                  type={inputType}
                  value={values[i.label] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [i.label]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-line p-2.5 text-sm outline-none focus:border-emerald"
                />
              </label>
            );
          })}
        </div>
      )}

      {error && <p className="text-sm text-risk">{error}</p>}
      <div className="flex justify-end gap-3">
        <button onClick={() => router.push("/campanhas")} className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium">Cancelar</button>
        <button onClick={generate} disabled={pending || !recipe}
          className="rounded-lg bg-emerald hover:bg-emeraldd transition text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-50">
          {pending ? "Gerando com a IA… (pode levar até 1 min)" : "Gerar campanha →"}
        </button>
      </div>
    </div>
  );
}
