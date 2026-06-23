"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActiveNav } from "@/lib/nav";

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <aside className="bg-ink text-paper flex flex-col p-4 sticky top-0 h-screen">
      <div className="px-2 py-3">
        <div className="font-display font-extrabold text-xl leading-none">Disparos Way</div>
        <div className="font-mono text-[10px] tracking-widest text-emerald uppercase mt-1">uso interno</div>
      </div>
      <nav className="mt-6 space-y-1 text-sm">
        {NAV_ITEMS.map((item) => {
          const active = isActiveNav(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 transition hover:bg-white/10 ${active ? "bg-paper text-ink" : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-white/10 pt-4 px-2">
        <div className="text-sm font-medium truncate">{email}</div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="mt-3 text-xs text-paper/60 underline hover:text-paper">Sair</button>
        </form>
      </div>
    </aside>
  );
}
