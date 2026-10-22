import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, route } from "@/server/http";
import { runOut } from "@/server/mappers";
import { recentRuns } from "@/server/services/checks";

export const runtime = "nodejs";

export const GET = route(async () => {
  const user = await requireProfile();
  return json((await recentRuns(getDb(), user)).map(runOut));
});
