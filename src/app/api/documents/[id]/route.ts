import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getStorage } from "@/server/integrations/storage";
import { noContent, parseId, route } from "@/server/http";
import { deleteDocument, getOwnedDocument } from "@/server/services/theses";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireProfile();
  const db = getDb();
  const { document } = await getOwnedDocument(db, user, parseId((await params).id));
  await deleteDocument(db, document, getStorage());
  return noContent();
});
