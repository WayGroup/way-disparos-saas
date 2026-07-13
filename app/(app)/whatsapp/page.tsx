import { listSyncedGroups, listCommunities } from "@/lib/db/communities";
import { getEvolutionConfig } from "@/lib/evolution/config";
import { evoConnectionState } from "@/lib/evolution/client";
import type { EvoConnectionState } from "@/lib/evolution/types";
import { ConnectionPanel } from "./_components/connection-panel";
import { GroupPicker } from "./_components/group-picker";

export const dynamic = "force-dynamic";

export default async function WhatsappPage() {
  const [groups, communities] = await Promise.all([listSyncedGroups(), listCommunities()]);

  let state: EvoConnectionState | null = null;
  let configError: string | null = null;

  try {
    state = await evoConnectionState(getEvolutionConfig(process.env));
  } catch (e) {
    configError = e instanceof Error ? e.message : "Falha ao falar com a Evolution.";
  }

  const orphans = communities.filter((c) => !c.wa_group_id);

  return (
    <div className="p-8 max-w-4xl">
      <div className="font-mono text-xs uppercase tracking-widest text-muted">
        Canal de envio · trilha Grupos
      </div>
      <h1 className="font-display font-bold text-3xl mt-1 mb-6">Conexão WhatsApp</h1>

      <div className="space-y-4">
        <ConnectionPanel
          initialState={state}
          configError={configError}
          syncedCount={groups.length}
        />

        {!configError && <GroupPicker groups={groups} />}

        {orphans.length > 0 && (
          <p className="text-xs text-muted">
            {orphans.length} comunidade(s) sem grupo do WhatsApp vinculado:{" "}
            {orphans.map((c) => c.name).join(", ")}. Elas não podem receber disparo.
          </p>
        )}
      </div>
    </div>
  );
}
