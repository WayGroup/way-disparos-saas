import Link from "next/link";
import { listCampaigns } from "@/lib/db/campaigns";
import { formatDateTimeBR } from "@/lib/format";

export default async function CampanhasPage() {
  const campaigns = await listCampaigns();
  return (
    <div className="p-8">
      <header className="flex items-end justify-between mb-6">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted">Visão geral</div>
          <h1 className="font-display font-bold text-3xl mt-1">Campanhas</h1>
        </div>
        <Link href="/campanhas/nova" className="rounded-lg bg-emerald hover:bg-emeraldd transition text-white text-sm font-semibold px-4 py-2.5">+ Nova campanha</Link>
      </header>

      {campaigns.length === 0 ? (
        <p className="text-muted text-sm">Nenhuma campanha ainda. Crie a primeira.</p>
      ) : (
        <div className="rounded-xl border border-line bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-paper text-muted font-mono text-xs uppercase">
              <tr>
                <th className="text-left font-medium px-4 py-3">Campanha</th>
                <th className="text-left font-medium px-4 py-3">Receita</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Criada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-paper transition">
                  <td className="px-4 py-3 font-medium"><Link href={`/campanhas/${c.id}`} className="hover:underline">{c.name}</Link></td>
                  <td className="px-4 py-3 text-muted">{c.recipe_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full text-xs font-medium px-2.5 py-1 ${c.status === "aprovada" ? "bg-emerald/15 text-emeraldd" : "bg-risk/15 text-risk"}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-muted font-mono text-xs">{formatDateTimeBR(new Date(c.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
