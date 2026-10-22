import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, parseBody, route } from "@/server/http";
import { disconnectAi, getAiStatus, saveAiConfig } from "@/server/services/ai-config";
import { aiConfigInSchema } from "@/lib/schemas";

export const runtime = "nodejs";

/** Kunci API tidak pernah dikembalikan; hanya empat karakter terakhir (key_hint). */
export const GET = route(async () => {
  await requireAdmin();
  return json(await getAiStatus(getDb()));
});

export const PUT = route(async (request: Request) => {
  const admin = await requireAdmin();
  const body = await parseBody(request, aiConfigInSchema);
  return json(await saveAiConfig(getDb(), admin.id, body));
});

export const DELETE = route(async () => {
  const admin = await requireAdmin();
  return json(await disconnectAi(getDb(), admin.id));
});
