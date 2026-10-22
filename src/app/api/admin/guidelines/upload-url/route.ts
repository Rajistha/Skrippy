import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/server/auth";
import { getStorage } from "@/server/integrations/storage";
import { json, parseBody, route } from "@/server/http";
import { guidelineUploadKey } from "@/server/services/guidelines";
import { guidelineUploadInSchema, type GuidelineUpload } from "@/lib/schemas";

export const runtime = "nodejs";

/** Berkas pedoman tidak lewat function (batas body 4,5 MB): browser mengunggah ke signed URL ini. */
export const POST = route(async (request: Request) => {
  await requireAdmin();
  const body = await parseBody(request, guidelineUploadInSchema);
  const path = guidelineUploadKey(randomUUID(), body.filename);
  const out: GuidelineUpload = { path, upload_url: await getStorage().createSignedUploadUrl(path) };
  return json(out, 201);
});
