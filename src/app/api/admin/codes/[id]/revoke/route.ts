import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { noContent, parseId, route } from "@/server/http";
import { revokeCode } from "@/server/services/access";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (_req: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  await revokeCode(getDb(), admin.id, parseId((await params).id));
  return noContent();
});
