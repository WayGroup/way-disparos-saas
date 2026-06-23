import { listAssets } from "@/lib/db/assets";
import { UploadZone } from "./_components/upload-zone";
import { AssetGrid } from "./_components/asset-grid";

export default async function MidiasPage() {
  const assets = await listAssets();
  return (
    <div className="p-8">
      <div className="font-mono text-xs uppercase tracking-widest text-muted">Biblioteca global · o Infra pega daqui</div>
      <h1 className="font-display font-bold text-3xl mt-1 mb-6">Mídias</h1>
      <div className="mb-6"><UploadZone /></div>
      <AssetGrid assets={assets} />
    </div>
  );
}
