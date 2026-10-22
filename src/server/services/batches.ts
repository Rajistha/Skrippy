import "server-only";
import { asc, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";
import { getEnv } from "../env";
import { NotFound } from "../errors";
import { decryptSecret } from "../integrations/secrets";
import { codeStatus, type CodeStatus } from "./admin";
import type { AccessCode } from "./access";

const { accessCodes, accessGrants, codeBatches, profiles } = schema;

/** Id khusus untuk kode lama yang dibuat sebelum ada batch. */
export const LEGACY_BATCH_ID = "lama";
/** Kode yang berlaku lebih dari 20 tahun dianggap tanpa batas waktu. */
const NO_EXPIRY_MS = 20 * 365 * 86_400_000;

export type BatchStatus = "active" | "used" | "expired";

export type BatchSummary = {
  id: string;
  /** Nomor tampilan ("Batch 3"); null untuk kelompok kode lama. */
  number: number | null;
  note: string | null;
  createdAt: Date;
  total: number;
  /** Jumlah penebusan dari seluruh kuota (mis. 3 dari 10). */
  redeemed: number;
  capacity: number;
  /** Tanggal batas terjauh; null bila tanpa batas waktu. */
  validUntil: Date | null;
  status: BatchStatus;
};

type CodeRowIn = AccessCode;

function summarize(
  base: Pick<BatchSummary, "id" | "number" | "note" | "createdAt">,
  codes: CodeRowIn[],
  now: Date,
): BatchSummary {
  const statuses = codes.map((c) => codeStatus(c, now));
  const latest = codes.reduce((m, c) => Math.max(m, c.redeemBefore.getTime()), 0);
  return {
    ...base,
    total: codes.length,
    redeemed: codes.reduce((n, c) => n + c.redemptionCount, 0),
    capacity: codes.reduce((n, c) => n + c.maxRedemptions, 0),
    validUntil: latest - now.getTime() > NO_EXPIRY_MS ? null : new Date(latest),
    // Aktif bila masih ada kode yang bisa ditukar; "habis" bila semuanya terpakai; sisanya kedaluwarsa.
    status: statuses.includes("active")
      ? "active"
      : statuses.every((s) => s === "used")
        ? "used"
        : "expired",
  };
}

export async function listBatches(db: Db, now: Date = new Date()): Promise<BatchSummary[]> {
  const [batches, codes] = await Promise.all([
    db.select().from(codeBatches).orderBy(desc(codeBatches.createdAt)),
    db.select().from(accessCodes),
  ]);
  const byBatch = new Map<string, CodeRowIn[]>();
  const legacy: CodeRowIn[] = [];
  for (const c of codes) {
    if (!c.batchId) legacy.push(c);
    else byBatch.set(c.batchId, [...(byBatch.get(c.batchId) ?? []), c]);
  }
  const out = batches.map((b) =>
    summarize(
      { id: b.id, number: b.number, note: b.note, createdAt: b.createdAt },
      byBatch.get(b.id) ?? [],
      now,
    ),
  );
  if (legacy.length > 0) {
    const first = legacy.reduce(
      (m, c) => (c.createdAt < m ? c.createdAt : m),
      legacy[0]!.createdAt,
    );
    out.push(
      summarize({ id: LEGACY_BATCH_ID, number: null, note: null, createdAt: first }, legacy, now),
    );
  }
  return out;
}

export type BatchCode = {
  id: string;
  /** Kode asli (didekripsi); null untuk kode lama yang hanya punya hash. */
  code: string | null;
  codeHint: string;
  status: CodeStatus;
  redemptionCount: number;
  maxRedemptions: number;
  redeemedBy: string[];
  record: AccessCode;
};

function decrypt(c: AccessCode): string | null {
  if (!c.codeEncrypted) return null;
  try {
    return decryptSecret(c.codeEncrypted, getEnv().ACCESS_CODE_HMAC_SECRET);
  } catch {
    return null;
  }
}

export async function getBatch(
  db: Db,
  id: string,
  now: Date = new Date(),
): Promise<{ summary: BatchSummary; codes: BatchCode[] }> {
  let base: Pick<BatchSummary, "id" | "number" | "note" | "createdAt">;
  let rows: AccessCode[];
  if (id === LEGACY_BATCH_ID) {
    rows = await db
      .select()
      .from(accessCodes)
      .where(isNull(accessCodes.batchId))
      .orderBy(desc(accessCodes.createdAt));
    if (rows.length === 0) throw new NotFound("Batch tidak ditemukan.");
    base = { id, number: null, note: null, createdAt: rows[rows.length - 1]!.createdAt };
  } else {
    const [batch] = await db.select().from(codeBatches).where(eq(codeBatches.id, id));
    if (!batch) throw new NotFound("Batch tidak ditemukan.");
    rows = await db
      .select()
      .from(accessCodes)
      .where(eq(accessCodes.batchId, id))
      .orderBy(asc(accessCodes.createdAt), asc(accessCodes.id));
    base = { id: batch.id, number: batch.number, note: batch.note, createdAt: batch.createdAt };
  }

  const redeemers = await db
    .select({ codeId: accessGrants.accessCodeId, email: profiles.email })
    .from(accessGrants)
    .innerJoin(profiles, eq(profiles.id, accessGrants.userId));
  const emails = new Map<string, string[]>();
  for (const r of redeemers)
    if (r.codeId) emails.set(r.codeId, [...(emails.get(r.codeId) ?? []), r.email]);

  return {
    summary: summarize(base, rows, now),
    codes: rows.map((c) => ({
      id: c.id,
      code: decrypt(c),
      codeHint: c.codeHint,
      status: codeStatus(c, now),
      redemptionCount: c.redemptionCount,
      maxRedemptions: c.maxRedemptions,
      redeemedBy: emails.get(c.id) ?? [],
      record: c,
    })),
  };
}
