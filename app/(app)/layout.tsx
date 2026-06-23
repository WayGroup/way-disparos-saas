import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b p-4">
        <nav className="flex gap-4">
          <Link href="/campanhas">Campanhas</Link>
          <Link href="/receitas">Receitas</Link>
          <Link href="/base-conhecimento">Base de conhecimento</Link>
        </nav>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm text-gray-600 underline">Sair</button>
        </form>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
