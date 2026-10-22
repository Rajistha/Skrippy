import { eq, and } from "drizzle-orm";
import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { schema } from "@/server/db";
import { NotFound } from "@/server/errors";
import { json, parseId, route } from "@/server/http";
import { getOwnedRun } from "@/server/services/checks";
import { addIgnored } from "@/server/services/dictionary";
import type { IgnoredEntry } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string; issueId: string }> };

/** Selalu abaikan temuan seperti ini di cek berikutnya (per aturan dan kata). */
export const POST = route(async (_request: Request, { params }: Ctx) => {
  const user = await requireProfile();
  const db = getDb();
  const { id, issueId } = await params;
  const run = await getOwnedRun(db, user, parseId(id));
  const [issue] = await db
    .select()
    .from(schema.checkIssues)
    .where(
      and(eq(schema.checkIssues.id, parseId(issueId)), eq(schema.checkIssues.checkRunId, run.id)),
    );
  if (!issue) throw new NotFound("Temuan tidak ditemukan.");
  const row = await addIgnored(db, user.id, {
    ruleCode: issue.ruleCode,
    message: issue.message,
    excerpt: issue.excerpt ?? undefined,
  });
  const body: IgnoredEntry = { id: row.id, rule_code: row.ruleCode, text: row.text };
  return json(body, 201);
});
