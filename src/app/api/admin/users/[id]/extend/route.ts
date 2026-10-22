import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { noContent, parseBody, parseId, route } from "@/server/http";
import { extendAccess } from "@/server/services/access";
import { extendInSchema } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const body = await parseBody(request, extendInSchema);
  await extendAccess(getDb(), admin.id, parseId((await params).id), body);
  return noContent();
});
