"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRecipeAction } from "../actions";

export function NewRecipeButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(async () => {
        const id = await createRecipeAction();
        router.push(`/receitas/${id}`);
      })}
      disabled={pending}
      className="rounded-lg border border-dashed border-line w-full py-4 text-sm text-muted hover:border-ink2 hover:text-ink2 transition disabled:opacity-50"
    >
      {pending ? "Criando..." : "+ Nova receita"}
    </button>
  );
}
