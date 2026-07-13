import { listActiveGroups } from "@/lib/db/communities";
import { listAssets } from "@/lib/db/assets";
import { getAppSettings } from "@/lib/db/sends";
import { QuickSendForm } from "./_components/quick-send-form";

export const dynamic = "force-dynamic";

export default async function DisparoRapidoPage() {
  const [groups, assets, settings] = await Promise.all([
    listActiveGroups(),
    listAssets(),
    getAppSettings(),
  ]);

  return (
    <div className="p-8 max-w-5xl">
      <div className="font-mono text-xs uppercase tracking-widest text-muted">
        Mensagem avulsa · sem campanha
      </div>
      <h1 className="font-display font-bold text-3xl mt-1 mb-6">Disparo rápido</h1>

      {settings.sends_paused && (
        <div className="mb-4 rounded-xl border border-risk/40 bg-risk/10 p-4 text-sm text-risk">
          Os envios estão pausados. O que você mandar daqui entra na fila e só sai quando
          alguém retomar em <a href="/envios" className="underline font-semibold">Envios</a>.
        </div>
      )}

      <QuickSendForm groups={groups} assets={assets} />
    </div>
  );
}
