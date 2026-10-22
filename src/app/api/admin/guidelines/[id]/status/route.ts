import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, parseBody, parseId, route } from "@/server/http";
import { setGuidelineStatus } from "@/server/services/guidelines";
import { guidelineStatusInSchema } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const body = await parseBody(request, guidelineStatusInSchema);
  return json(await setGuidelineStatus(getDb(), admin.id, parseId((await params).id), body.status));
});
