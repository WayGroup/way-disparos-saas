import { listBrandBlocks } from "@/lib/db/brand-knowledge";
import { listCommunities } from "@/lib/db/communities";
import { BlockCard } from "./_components/block-card";
import { CommunitiesManager } from "./_components/communities-manager";

export default async function BaseConhecimentoPage() {
  const [blocks, communities] = await Promise.all([listBrandBlocks(), listCommunities()]);

  return (
    <div className="p-8 max-w-5xl">
      <div className="font-mono text-xs uppercase tracking-widest text-muted">Contexto da marca · usado em toda geração</div>
      <h1 className="font-display font-bold text-3xl mt-1 mb-6">Base de conhecimento — Way</h1>

      <div className="grid grid-cols-2 gap-4">
        {blocks.map((block) => (
          <BlockCard key={block.id} block={block} />
        ))}
      </div>

      <div className="mt-8">
        <CommunitiesManager communities={communities} />
      </div>

      <p className="text-xs text-muted mt-4 font-mono">Toda alteração aqui passa a valer nas próximas gerações.</p>
    </div>
  );
}
