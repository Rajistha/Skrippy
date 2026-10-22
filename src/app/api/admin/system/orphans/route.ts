import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, route } from "@/server/http";
import { getStorage } from "@/server/integrations/storage";
import { cleanOrphans, findOrphans } from "@/server/services/orphans";
import type { OrphanScan } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Pindai file yatim di storage (tidak mengubah apa pun). Hanya admin. */
export const GET = route(async () => {
  await requireAdmin();
  const scan = await findOrphans(getDb(), getStorage());
  const body: OrphanScan = {
    scanned: scan.scanned,
    count: scan.count,
    bytes: scan.bytes,
    sample: scan.sample,
  };
  const res = json(body);
  res.headers.set("Cache-Control", "no-store");
  return res;
});

/** Hapus file yatim. Server memindai ulang sendiri. Permanen. Hanya admin. */
export const POST = route(async () => {
  const admin = await requireAdmin();
  const result = await cleanOrphans(getDb(), getStorage(), admin.id);
  return json({ deleted: result.deleted, bytes: result.bytes });
});
