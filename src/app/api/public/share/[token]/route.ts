import { getDb } from "@/server/db/client";
import { json, route } from "@/server/http";
import { getSharedReport } from "@/server/services/sharing";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ token: string }> };

const NOT_FOUND = {
  error: { code: "not_found", message: "Tautan tidak valid atau sudah tidak berlaku." },
};

/** Tanpa login: pemegang tautan yang valid dan belum dicabut boleh membaca laporan. */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const token = (await params).token;
  // Bentuk token salah tidak perlu menyentuh database.
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json(NOT_FOUND, 404);
  const res = json(await getSharedReport(getDb(), token));
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
});
