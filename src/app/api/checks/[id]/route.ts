import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, parseId, route } from "@/server/http";
import { runOut } from "@/server/mappers";
import { getOwnedRun } from "@/server/services/checks";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireProfile();
  return json(runOut(await getOwnedRun(getDb(), user, parseId((await params).id))));
});
