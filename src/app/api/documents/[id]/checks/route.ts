import { after } from "next/server";
import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getStorage } from "@/server/integrations/storage";
import { json, parseBody, parseId, route } from "@/server/http";
import { runOut } from "@/server/mappers";
import { getAiClient } from "@/server/services/ai-config";
import { createCheckRun, executeCheckRun } from "@/server/services/checks";
import { getOwnedDocument } from "@/server/services/theses";
import { runCheckInSchema } from "@/lib/schemas";

export const runtime = "nodejs";
/** Batas Vercel Function. Pemeriksaan berjalan di dalam function ini setelah respons dikirim. */
export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, { params }: Ctx) => {
  const user = await requireProfile();
  const db = getDb();
  const { document, thesis } = await getOwnedDocument(db, user, parseId((await params).id));
  const body = await parseBody(request, runCheckInSchema);
  const run = await createCheckRun(
    db,
    user,
    thesis,
    document,
    body.check_types ?? null,
    new Date(),
    body.skip_rules ?? null,
  );
  // Respons 202 segera; browser polling status. Job harian membersihkan run yang macet.
  after(async () => {
    const ai = run.checkTypes.includes("ai") ? await getAiClient(db) : null;
    await executeCheckRun(db, getStorage(), run.id, undefined, ai);
  });
  return json(runOut(run), 202);
});
