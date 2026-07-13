import { timingSafeEqual } from "node:crypto";
import { dispatchDue } from "@/lib/sends/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Teto do plano Hobby. Com limite de 10 e envio sequencial (~1-3s cada), cabe.
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const given = req.headers.get("x-cron-secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  // timingSafeEqual exige o mesmo tamanho; comparar antes já vaza o tamanho, o que
  // é aceitável, mas evita a exceção.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return Response.json({ error: "não autorizado" }, { status: 401 });
  }

  try {
    const { claimed, results } = await dispatchDue();
    return Response.json({
      claimed,
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      errors: results.filter((r) => !r.ok).map((r) => `${r.wa_subject}: ${r.error}`),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha no worker.";
    console.error(`[cron/dispatch] ${message}`);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}

/** GET com o mesmo header, para conferir o worker à mão sem montar um POST. */
export async function GET(req: Request): Promise<Response> {
  return handle(req);
}
