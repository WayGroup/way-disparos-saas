import { listCommunities } from "@/lib/db/communities";
import { getEvolutionConfig } from "@/lib/evolution/config";
import { evoConnectionState } from "@/lib/evolution/client";
import type { EvoConnectionState } from "@/lib/evolution/types";
import { ConnectionPanel } from "./_components/connection-panel";

export const dynamic = "force-dynamic";

export default async function WhatsappPage() {
  const communities = await listCommunities();

  let state: EvoConnectionState | null = null;
  let configError: string | null = null;

  try {
    state = await evoConnectionState(getEvolutionConfig(process.env));
  } catch (e) {
    configError = e instanceof Error ? e.message : "Falha ao falar com a Evolution.";
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="font-mono text-xs uppercase tracking-widest text-muted">
        Canal de envio · trilha Grupos
      </div>
      <h1 className="font-display font-bold text-3xl mt-1 mb-6">Conexão WhatsApp</h1>

      <ConnectionPanel
        initialState={state}
        configError={configError}
        communities={communities}
      />
    </div>
  );
}
