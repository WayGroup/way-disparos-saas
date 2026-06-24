import { listLinks } from "@/lib/db/links";
import { LinksManager } from "./_components/links-manager";

export default async function LinksPage() {
  const links = await listLinks();
  return (
    <div className="p-8 max-w-4xl">
      <div className="font-mono text-xs uppercase tracking-widest text-muted">Links padrão · reutilizáveis nos disparos</div>
      <h1 className="font-display font-bold text-3xl mt-1 mb-6">Links</h1>
      <LinksManager links={links} />
    </div>
  );
}
