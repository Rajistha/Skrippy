import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, route } from "@/server/http";
import { listBatches } from "@/server/services/batches";
import type { BatchSummary } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireAdmin();
  const rows = await listBatches(getDb());
  const body: BatchSummary[] = rows.map((b) => ({
    id: b.id,
    number: b.number,
    note: b.note,
    created_at: b.createdAt.toISOString(),
    total: b.total,
    redeemed: b.redeemed,
    capacity: b.capacity,
    valid_until: b.validUntil?.toISOString() ?? null,
    status: b.status,
  }));
  return json(body);
});
