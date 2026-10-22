import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { noContent, parseId, route } from "@/server/http";
import { deleteDictionaryEntry } from "@/server/services/dictionary";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route(async (_request: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  await deleteDictionaryEntry(getDb(), admin.id, parseId((await params).id));
  return noContent();
});
