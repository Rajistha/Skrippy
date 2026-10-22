import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, parseBody, route } from "@/server/http";
import { getModelList } from "@/server/services/ai-config";
import { aiModelsInSchema } from "@/lib/schemas";

export const runtime = "nodejs";

/** Daftar model untuk satu penyedia. Kunci di isi permintaan hanya dipakai sekali dan tidak disimpan. */
export const POST = route(async (request: Request) => {
  await requireAdmin();
  const body = await parseBody(request, aiModelsInSchema);
  return json(await getModelList(getDb(), body));
});
