import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getStorage } from "@/server/integrations/storage";
import { json, noContent, parseId, route } from "@/server/http";
import { documentOut, thesisOut } from "@/server/mappers";
import { deleteThesis, getOwnedThesis, listDocuments } from "@/server/services/theses";
import type { ThesisDetail } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireProfile();
  const db = getDb();
  const thesis = await getOwnedThesis(db, user, parseId((await params).id));
  const body: ThesisDetail = {
    ...thesisOut(thesis),
    documents: (await listDocuments(db, thesis)).map(documentOut),
  };
  return json(body);
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireProfile();
  const db = getDb();
  const thesis = await getOwnedThesis(db, user, parseId((await params).id));
  await deleteThesis(db, thesis, getStorage());
  return noContent();
});
