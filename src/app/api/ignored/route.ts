import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, route } from "@/server/http";
import { listIgnored } from "@/server/services/dictionary";
import type { IgnoredEntry } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = route(async () => {
  const user = await requireProfile();
  const rows = await listIgnored(getDb(), user.id);
  const body: IgnoredEntry[] = rows.map((r) => ({ id: r.id, rule_code: r.ruleCode, text: r.text }));
  return json(body);
});
