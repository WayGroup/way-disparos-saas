"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCopyChatAction } from "../actions";

export function DeleteChatButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Remover esta conversa?")) return;
    startTransition(async () => {
      await deleteCopyChatAction(id);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="font-mono text-[10px] uppercase tracking-wide text-risk hover:underline disabled:opacity-40"
    >
      {pending ? "removendo…" : "remover"}
    </button>
  );
}
