import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, parseBody, parseId, route } from "@/server/http";
import { getGuideline, updateGuideline } from "@/server/services/guidelines";
import { guidelineInSchema } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Ctx) => {
  await requireAdmin();
  return json(await getGuideline(getDb(), parseId((await params).id)));
});

export const PUT = route(async (request: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const body = await parseBody(request, guidelineInSchema);
  return json(await updateGuideline(getDb(), admin.id, parseId((await params).id), body));
});
