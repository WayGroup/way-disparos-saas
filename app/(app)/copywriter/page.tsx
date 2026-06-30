import Link from "next/link";
import { listCopyChats } from "@/lib/db/copy-chats";
import { formatDateTimeBR } from "@/lib/format";
import { NewChatButton } from "./_components/new-chat-button";
import { DeleteChatButton } from "./_components/delete-chat-button";

export default async function CopywriterPage() {
  const chats = await listCopyChats();
  return (
    <div className="p-8">
      <header className="flex items-end justify-between mb-6">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted">Geração de copy</div>
          <h1 className="font-display font-bold text-3xl mt-1">Copywriter</h1>
        </div>
        <NewChatButton />
      </header>

      {chats.length === 0 ? (
        <p className="text-muted text-sm">Nenhuma conversa ainda. Crie a primeira.</p>
      ) : (
        <div className="rounded-xl border border-line bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-paper text-muted font-mono text-xs uppercase">
              <tr>
                <th className="text-left font-medium px-4 py-3">Conversa</th>
                <th className="text-left font-medium px-4 py-3">Atualizada</th>
                <th className="text-left font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {chats.map((chat) => (
                <tr key={chat.id} className="hover:bg-paper transition">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/copywriter/${chat.id}`} className="hover:underline">
                      {chat.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted font-mono text-xs">
                    {formatDateTimeBR(new Date(chat.updated_at))}
                  </td>
                  <td className="px-4 py-3">
                    <DeleteChatButton id={chat.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
