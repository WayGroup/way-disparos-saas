"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActiveNav } from "@/lib/nav";

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <aside className="relative bg-ink text-paper flex flex-col p-4 sticky top-0 h-screen overflow-hidden">
      {/* textura de grid técnico ao fundo */}
      <div className="tech-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />

      <div className="relative flex items-center gap-2.5 px-2 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/way-logo.svg" alt="Way" width={30} height={30} className="shrink-0" />
        <div>
          <div className="font-display font-extrabold text-lg leading-none tracking-tight">Disparos Way</div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="signal-dot" aria-hidden />
            <span className="font-mono text-[10px] tracking-[0.18em] text-brand2 uppercase">console interno</span>
          </div>
        </div>
      </div>

      <nav className="relative mt-7 space-y-0.5 text-sm">
        {NAV_ITEMS.map((item) => {
          const active = isActiveNav(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-center rounded-lg px-3 py-2 transition ${
                active ? "bg-white/10 text-paper font-medium" : "text-paper/70 hover:bg-white/[0.06] hover:text-paper"
              }`}
            >
              <span
                className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-emerald transition-opacity ${
                  active ? "opacity-100" : "opacity-0"
                }`}
                aria-hidden
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="relative mt-auto border-t border-white/10 pt-4 px-2">
        <div className="font-mono text-[10px] tracking-widest text-paper/40 uppercase">Sessão</div>
        <div className="text-sm font-medium truncate mt-1">{email}</div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="mt-2 text-xs text-paper/55 hover:text-paper transition">Sair →</button>
        </form>
      </div>
    </aside>
  );
}
