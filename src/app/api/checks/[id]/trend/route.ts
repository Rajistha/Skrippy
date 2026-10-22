import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, parseId, route } from "@/server/http";
import { getOwnedRun, scoreTrend } from "@/server/services/checks";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Skor tiap versi naskah dalam skripsi yang sama. */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const user = await requireProfile();
  const db = getDb();
  const run = await getOwnedRun(db, user, parseId((await params).id));
  return json(await scoreTrend(db, run));
});
