import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, parseBody, route } from "@/server/http";
import { createGuideline, listAllGuidelines } from "@/server/services/guidelines";
import { guidelineInSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireAdmin();
  return json(await listAllGuidelines(getDb()));
});

export const POST = route(async (request: Request) => {
  const admin = await requireAdmin();
  const body = await parseBody(request, guidelineInSchema);
  return json(await createGuideline(getDb(), admin.id, body), 201);
});
