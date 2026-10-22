import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getStorage } from "@/server/integrations/storage";
import { json, parseId, route } from "@/server/http";
import { documentOut } from "@/server/mappers";
import { confirmUpload, getOwnedDocument } from "@/server/services/theses";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/** Unduh berkas dari Storage, validasi di server, lalu isi metadata. */
export const POST = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireProfile();
  const db = getDb();
  const { document, thesis } = await getOwnedDocument(db, user, parseId((await params).id));
  const confirmed = await confirmUpload(db, thesis, document, getStorage());
  return json(documentOut({ ...confirmed, latestScore: null, latestRunId: null }));
});
