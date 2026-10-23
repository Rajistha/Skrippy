import { NextResponse } from "next/server";
import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getStorage } from "@/server/integrations/storage";
import { parseId, route } from "@/server/http";
import { getOwnedRun } from "@/server/services/checks";
import { buildPreview } from "@/server/services/reports";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Teks naskah per paragraf untuk pratinjau di aplikasi. Hanya pemilik atau superadmin; tidak disimpan di cache. */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const user = await requireProfile();
  const db = getDb();
  const run = await getOwnedRun(db, user, parseId((await params).id));
  const body = await buildPreview(db, getStorage(), run);
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
});
