import { requireAdmin } from "@/server/auth";
import { getStorage } from "@/server/integrations/storage";
import { json, parseBody, route } from "@/server/http";
import { extractFromStorage } from "@/server/services/guidelines";
import { guidelineExtractInSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Membaca berkas pedoman yang sudah diunggah dan mengusulkan aturan. Hasilnya draft untuk ditinjau admin. */
export const POST = route(async (request: Request) => {
  await requireAdmin();
  const body = await parseBody(request, guidelineExtractInSchema);
  return json(await extractFromStorage(getStorage(), body.path));
});
