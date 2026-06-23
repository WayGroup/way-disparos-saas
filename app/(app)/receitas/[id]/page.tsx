import { notFound } from "next/navigation";
import { getRecipe } from "@/lib/db/recipes";
import { RecipeEditor } from "./_components/recipe-editor";

export default async function RecipeEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();
  return <RecipeEditor recipe={recipe} />;
}
