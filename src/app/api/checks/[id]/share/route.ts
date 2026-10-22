import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { json, parseId, route } from "@/server/http";
import { getOwnedRun } from "@/server/services/checks";
import { createShareLink, listActiveLinks } from "@/server/services/sharing";
import type { CreatedShare } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Ctx) => {
  const user = await requireProfile();
  const db = getDb();
  const run = await getOwnedRun(db, user, parseId((await params).id));
  return json(await listActiveLinks(db, run));
});

/** Token asli hanya ada di respons ini. Setelahnya tidak bisa dilihat lagi, hanya dicabut. */
export const POST = route(async (_request: Request, { params }: Ctx) => {
  const user = await requireProfile();
  const db = getDb();
  const run = await getOwnedRun(db, user, parseId((await params).id));
  const { link, token } = await createShareLink(db, user.id, run);
  const base = getEnv().APP_BASE_URL.replace(/\/$/, "");
  const body: CreatedShare = { link, url: `${base}/bagikan/${token}` };
  return json(body, 201);
});
