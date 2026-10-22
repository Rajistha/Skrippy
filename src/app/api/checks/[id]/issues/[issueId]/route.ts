import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, parseBody, parseId, route } from "@/server/http";
import { issueOut } from "@/server/mappers";
import { getOwnedRun, setIssueStatus } from "@/server/services/checks";
import { getStorage } from "@/server/integrations/storage";
import { issueStatusInSchema } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string; issueId: string }> };

export const PATCH = route(async (request: Request, { params }: Ctx) => {
  const user = await requireProfile();
  const db = getDb();
  const { id, issueId } = await params;
  const run = await getOwnedRun(db, user, parseId(id));
  const body = await parseBody(request, issueStatusInSchema);
  return json(
    issueOut(await setIssueStatus(db, run, parseId(issueId), body.user_status, getStorage())),
  );
});
