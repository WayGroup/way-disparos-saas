"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("E-mail ou senha inválidos.");
      return;
    }
    router.push("/campanhas");
    router.refresh();
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      {/* painel de marca */}
      <section className="relative hidden lg:flex flex-col justify-between bg-ink text-paper p-12 overflow-hidden">
        <div className="tech-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
        {/* W gigante como marca d'água */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/way-logo.svg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-32 -bottom-40 w-[760px] max-w-none opacity-[0.06]"
        />

        <div className="relative flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/way-logo.svg" alt="Way" width={34} height={34} />
          <span className="font-mono text-xs tracking-[0.2em] text-brand2 uppercase">Way Group · console interno</span>
        </div>

        <div className="relative rise">
          <h2 className="font-display font-extrabold text-5xl leading-[1.04] tracking-tight">
            Disparos<br />Way
          </h2>
          <p className="mt-5 max-w-sm text-paper/65 leading-relaxed">
            Gera campanhas de WhatsApp em cima da nossa base — webinário, promo, esteira — com a
            estrutura de custo (template → janela → fallback) embutida. Sem hype. Vender a verdade.
          </p>
          <div className="mt-9 grid grid-cols-3 gap-px bg-white/10 rounded-xl overflow-hidden border border-white/10">
            {[
              ["+R$55mi", "gerados"],
              ["9,58", "satisfação"],
              ["+500", "mentorados"],
            ].map(([n, l]) => (
              <div key={l} className="bg-ink px-4 py-4">
                <div className="font-display text-2xl font-bold">{n}</div>
                <div className="font-mono text-[10px] tracking-widest text-paper/50 uppercase mt-0.5">{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative font-mono text-[11px] tracking-widest text-paper/35 uppercase">
          Belo Horizonte · MG
        </div>
      </section>

      {/* formulário */}
      <section className="flex items-center justify-center p-6 sm:p-12">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/way-logo.svg" alt="Way" width={28} height={28} />
            <span className="font-display font-bold">Disparos Way</span>
          </div>

          <div className="font-mono text-xs uppercase tracking-widest text-muted">Acesso do time</div>
          <h1 className="font-display font-bold text-3xl mt-1 mb-7">Entrar</h1>

          <div className="space-y-4">
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-wide text-muted">E-mail</span>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                placeholder="voce@waygroup.com.br"
                className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-wide text-muted">Senha</span>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald"
              />
            </label>
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-risk/30 bg-risk/8 px-3 py-2 text-sm text-risk">{error}</p>
          )}

          <button
            type="submit" disabled={loading}
            className="mt-6 w-full rounded-lg bg-emerald hover:bg-emeraldd transition text-white font-semibold p-2.5 disabled:opacity-50"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>

          <p className="mt-6 font-mono text-[11px] text-muted/70 tracking-wide">Acesso restrito · Way Group</p>
        </form>
      </section>
    </main>
  );
}
