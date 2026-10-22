import { NextResponse } from "next/server";
import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getStorage } from "@/server/integrations/storage";
import { parseId, route } from "@/server/http";
import { getOwnedRun } from "@/server/services/checks";
import { buildHighlightedPdf } from "@/server/services/reports";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, { params }: Ctx) => {
  const user = await requireProfile();
  const db = getDb();
  const run = await getOwnedRun(db, user, parseId((await params).id));
  const { bytes, filename } = await buildHighlightedPdf(db, getStorage(), run);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
