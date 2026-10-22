import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { noContent, parseBody, parseId, route } from "@/server/http";
import { stopAccess } from "@/server/services/access";
import { stopInSchema } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const body = await parseBody(request, stopInSchema);
  await stopAccess(getDb(), admin.id, parseId((await params).id), body);
  return noContent();
});
