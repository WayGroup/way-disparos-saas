import { listRecipes, getRecipe } from "@/lib/db/recipes";
import { listLinks } from "@/lib/db/links";
import type { RecipeWithChildren } from "@/lib/db/types";
import { NewCampaignForm } from "./_components/new-campaign-form";

// A geração via IA leva ~30-60s; sem isso a Server Action estoura o timeout padrão (30s) no Vercel.
export const maxDuration = 300;

export default async function NovaCampanhaPage() {
  const recipes = await listRecipes();
  const detailed = (await Promise.all(recipes.filter((r) => r.active).map((r) => getRecipe(r.id))))
    .filter((r): r is RecipeWithChildren => r !== null);
  const links = await listLinks();
  return (
    <div className="p-8 max-w-3xl">
      <div className="font-mono text-xs uppercase tracking-widest text-muted">Passo 1 de 1</div>
      <h1 className="font-display font-bold text-3xl mt-1 mb-6">Nova campanha</h1>
      <NewCampaignForm recipes={detailed} links={links} />
    </div>
  );
}
