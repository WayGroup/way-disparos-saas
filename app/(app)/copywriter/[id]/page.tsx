import { notFound } from "next/navigation";
import { getCopyChat } from "@/lib/db/copy-chats";
import { CopyChat } from "./_components/copy-chat";

export const maxDuration = 300;

export default async function CopyChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCopyChat(id);
  if (!data) notFound();
  return (
    <div className="h-full p-4">
      <div className="h-full rounded-xl border border-line bg-white overflow-hidden">
        <CopyChat chatId={data.chat.id} initialMessages={data.messages} />
      </div>
    </div>
  );
}
