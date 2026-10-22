import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, route } from "@/server/http";
import { deleteBatch } from "@/server/services/access";
import { getBatch, LEGACY_BATCH_ID } from "@/server/services/batches";
import { AppError } from "@/server/errors";
import type { BatchDetail } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const parseBatchId = (v: string): string => {
  if (v === LEGACY_BATCH_ID || UUID.test(v)) return v;
  throw new AppError("Id batch tidak valid.", "validation_error", 400);
};

/** Memuat kode asli (didekripsi): khusus admin dan tidak boleh disimpan cache. */
export const GET = route(async (_request: Request, { params }: Ctx) => {
  await requireAdmin();
  const db = getDb();
  const { summary, codes } = await getBatch(db, parseBatchId((await params).id));
  const body: BatchDetail = {
    batch: {
      id: summary.id,
      number: summary.number,
      note: summary.note,
      created_at: summary.createdAt.toISOString(),
      total: summary.total,
      redeemed: summary.redeemed,
      capacity: summary.capacity,
      valid_until: summary.validUntil?.toISOString() ?? null,
      status: summary.status,
    },
    codes: codes.map((c) => ({
      id: c.id,
      code: c.code,
      code_hint: c.codeHint,
      status: c.status,
      redemption_count: c.redemptionCount,
      max_redemptions: c.maxRedemptions,
      redeemed_by: c.redeemedBy,
    })),
  };
  const res = json(body);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
});

/** Cabut batch: semua kodenya dihapus dan akses yang berasal darinya ikut dicabut. */
export const DELETE = route(async (_request: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const id = parseBatchId((await params).id);
  if (id === LEGACY_BATCH_ID) {
    throw new AppError(
      "Kelompok kode lama dihapus per kode, bukan sekaligus.",
      "legacy_batch",
      409,
    );
  }
  const { codesDeleted, usersAffected } = await deleteBatch(getDb(), admin.id, id);
  return json({ codes_deleted: codesDeleted, users_affected: usersAffected });
});
