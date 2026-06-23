import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { Sidebar } from "./_components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="grid grid-cols-[230px_1fr] min-h-screen">
      <Sidebar email={user.email ?? "—"} />
      <div className="overflow-y-auto h-screen">{children}</div>
    </div>
  );
}
