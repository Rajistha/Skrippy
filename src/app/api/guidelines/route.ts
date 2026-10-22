import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, route } from "@/server/http";
import { listGuidelines } from "@/server/services/theses";
import type { Guideline } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireProfile();
  const rows = await listGuidelines(getDb());
  const body: Guideline[] = rows.map((g) => ({
    id: g.id,
    name: g.name,
    campus_name: g.campusName,
    version: g.version,
    citation_style: g.citationStyle,
  }));
  return json(body);
});
