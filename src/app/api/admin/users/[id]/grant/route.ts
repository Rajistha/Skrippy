import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { noContent, parseBody, parseId, route } from "@/server/http";
import { grantLifetime, grantTrial } from "@/server/services/access";
import { grantInSchema } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Admin memberi akses langsung: selamanya, atau trial N hari. Tanpa kode. */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const body = await parseBody(request, grantInSchema);
  const userId = parseId((await params).id);
  if (body.kind === "lifetime") await grantLifetime(getDb(), admin.id, userId);
  else await grantTrial(getDb(), admin.id, userId, body.days);
  return noContent();
});
