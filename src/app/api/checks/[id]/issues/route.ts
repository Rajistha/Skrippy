import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, parseId, route } from "@/server/http";
import { issueOut } from "@/server/mappers";
import { getOwnedRun, listIssues } from "@/server/services/checks";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, { params }: Ctx) => {
  const user = await requireProfile();
  const db = getDb();
  const run = await getOwnedRun(db, user, parseId((await params).id));
  const url = new URL(request.url);
  const rows = await listIssues(db, run, {
    category: url.searchParams.get("category") ?? undefined,
    severity: url.searchParams.get("severity") ?? undefined,
  });
  return json(rows.map(issueOut));
});
