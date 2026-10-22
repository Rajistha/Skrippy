import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { noContent, parseId, route } from "@/server/http";
import { getOwnedRun } from "@/server/services/checks";
import { revokeShareLink } from "@/server/services/sharing";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string; linkId: string }> };

export const DELETE = route(async (_request: Request, { params }: Ctx) => {
  const user = await requireProfile();
  const db = getDb();
  const { id, linkId } = await params;
  const run = await getOwnedRun(db, user, parseId(id));
  await revokeShareLink(db, user.id, run, parseId(linkId));
  return noContent();
});
