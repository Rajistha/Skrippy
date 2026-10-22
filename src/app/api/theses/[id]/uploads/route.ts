import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getStorage } from "@/server/integrations/storage";
import { json, parseBody, parseId, route } from "@/server/http";
import { getOwnedThesis, startUpload } from "@/server/services/theses";
import { uploadStartInSchema, type UploadStart } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Berkas tidak lewat function (batas body 4,5 MB): browser mengunggah ke signed URL yang dikembalikan di sini. */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const user = await requireProfile();
  const db = getDb();
  const thesis = await getOwnedThesis(db, user, parseId((await params).id));
  const body = await parseBody(request, uploadStartInSchema);
  const { document, uploadUrl } = await startUpload(db, user, thesis, body.filename, getStorage());
  const out: UploadStart = {
    document_id: document.id,
    upload_url: uploadUrl,
    version_no: document.versionNo,
  };
  return json(out, 201);
});
