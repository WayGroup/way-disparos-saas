import Link from "next/link";
import { listRecipes } from "@/lib/db/recipes";
import { NewRecipeButton } from "./_components/new-recipe-button";

export default async function ReceitasPage() {
  const recipes = await listRecipes();
  return (
    <div className="p-8 max-w-5xl">
      <div className="font-mono text-xs uppercase tracking-widest text-muted">Configuração</div>
      <h1 className="font-display font-bold text-3xl mt-1 mb-6">Receitas</h1>

      <div className="grid grid-cols-2 gap-4 mb-8">
        {recipes.map((r) => (
          <Link key={r.id} href={`/receitas/${r.id}`}
            className="block rounded-xl border border-line bg-white p-5 hover:border-emerald transition">
            <div className="flex items-center justify-between">
              <div className="font-display font-bold text-lg">{r.name}</div>
              <span className="font-mono text-xs text-emeraldd">{r.active ? "ativa" : "inativa"}</span>
            </div>
            <p className="text-sm text-muted mt-1">{r.description || "Sem descrição."}</p>
            <span className="mt-4 inline-block text-sm text-emeraldd font-medium">Editar receita →</span>
          </Link>
        ))}
      </div>

      <NewRecipeButton />
    </div>
  );
}
