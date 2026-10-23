import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, route } from "@/server/http";
import { listGuidelines } from "@/server/services/theses";
import type { Guideline } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireProfile();
  const rows = await listGuidelines(getDb());
  const body: Guideline[] = rows.map((g) => ({
    id: g.id,
    name: g.name,
    campus_name: g.campusName,
    version: g.version,
    citation_style: g.citationStyle,
  }));
  const res = json(body);
  // Daftar pedoman jarang berubah: cache di browser pengguna (bukan CDN, karena butuh sesi) agar halaman Skripsi tidak menunggu ulang.
  res.headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
  return res;
});
