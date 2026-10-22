import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, parseBody, route } from "@/server/http";
import { createCodes, getAppSettings } from "@/server/services/access";
import { whatsappMessage } from "@/server/services/admin";
import { createCodesInSchema, type CreatedCode } from "@/lib/schemas";

export const runtime = "nodejs";

/** Kode asli hanya dikembalikan di respons ini, satu kali. */
export const POST = route(async (request: Request) => {
  const admin = await requireAdmin();
  const input = await parseBody(request, createCodesInSchema);
  const db = getDb();
  const created = await createCodes(db, admin.id, {
    kind: input.kind,
    count: input.count,
    maxRedemptions: input.max_redemptions,
    // Berlaku sampai akhir hari yang dipilih menurut WIB.
    validUntil: input.valid_until ? new Date(`${input.valid_until}T23:59:59.999+07:00`) : null,
    recipientNote: input.recipient_note ?? null,
    priceIdr: input.price_idr ?? null,
    paymentMethod: input.payment_method ?? null,
    paidOn: input.paid_on ?? null,
    paymentNote: input.payment_note ?? null,
  });
  const packageName = (await getAppSettings(db))["package.name"];
  const body: CreatedCode[] = created.map((c) => ({
    id: c.record.id,
    batch_id: c.record.batchId,
    code: c.plain,
    kind: c.record.kind as CreatedCode["kind"],
    redeem_before: c.record.redeemBefore.toISOString(),
    duration_days: c.record.durationDays,
    check_limit: c.record.checkLimit,
    recipient_note: c.record.recipientNote,
    message: whatsappMessage(c, packageName),
  }));
  return json(body, 201);
});
