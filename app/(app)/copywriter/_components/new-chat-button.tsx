"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCopyChatAction } from "../actions";

export function NewChatButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const id = await createCopyChatAction();
      router.push(`/copywriter/${id}`);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded-lg bg-emerald hover:bg-emeraldd transition text-white text-sm font-semibold px-4 py-2.5 disabled:opacity-50"
    >
      {pending ? "Criando…" : "+ Nova conversa"}
    </button>
  );
}
