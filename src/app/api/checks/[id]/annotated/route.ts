import { NextResponse } from "next/server";
import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getStorage } from "@/server/integrations/storage";
import { parseId, route } from "@/server/http";
import { getOwnedRun } from "@/server/services/checks";
import { buildHighlightedDocx } from "@/server/services/reports";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/** Salinan naskah dengan teks bermasalah disorot. File asli tidak diubah. */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const user = await requireProfile();
  const db = getDb();
  const run = await getOwnedRun(db, user, parseId((await params).id));
  const { bytes, filename } = await buildHighlightedDocx(db, getStorage(), run);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
