import { listSends, countSendsByStatus, getAppSettings } from "@/lib/db/sends";
import type { SendStatus } from "@/lib/db/types";
import { PauseSwitch } from "./_components/pause-switch";
import { SendsTable } from "./_components/sends-table";

export const dynamic = "force-dynamic";

const STATUSES: SendStatus[] = ["pendente", "enviando", "enviado", "falhou", "cancelado"];

function parseStatus(value: string | undefined): SendStatus | undefined {
  return STATUSES.includes(value as SendStatus) ? (value as SendStatus) : undefined;
}

export default async function EnviosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = parseStatus(status);

  const [sends, counts, settings] = await Promise.all([
    listSends({ status: filter }),
    countSendsByStatus(),
    getAppSettings(),
  ]);

  return (
    <div className="p-8 max-w-6xl">
      <div className="font-mono text-xs uppercase tracking-widest text-muted">
        Fila de disparo · trilha Grupos
      </div>
      <h1 className="font-display font-bold text-3xl mt-1 mb-6">Envios</h1>

      <PauseSwitch paused={settings.sends_paused} reason={settings.paused_reason} />

      <div className="mt-6">
        <SendsTable sends={sends} counts={counts} activeStatus={filter} />
      </div>
    </div>
  );
}
