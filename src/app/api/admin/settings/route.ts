import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, parseBody, route } from "@/server/http";
import { getAppSettings, updateSettings } from "@/server/services/access";
import { settingsInSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireAdmin();
  return json({ values: await getAppSettings(getDb()) });
});

export const PUT = route(async (request: Request) => {
  const admin = await requireAdmin();
  const body = await parseBody(request, settingsInSchema);
  return json({ values: await updateSettings(getDb(), admin.id, body.values) });
});
