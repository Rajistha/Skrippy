import "server-only";
import type { Db } from "../db";
import { schema } from "../db";
import { AppError } from "../errors";
import type { StorageClient } from "../integrations/storage";
import * as access from "./access";

const { documents } = schema;

/** Unggahan yang baru masuk belum tentu sudah tercatat di database, jadi diberi tenggang. */
const GRACE_MS = 60 * 60 * 1000;
/** Unggahan sementara pedoman dihapus setelah dipakai; sisanya aman dibuang setelah sehari. */
const GUIDELINE_TMP_GRACE_MS = 24 * 60 * 60 * 1000;
const DELETE_BATCH = 100;

/** `<storageKey>.<runId>.report[.vN].pdf` -> storageKey. */
const REPORT_COPY = /^(.+)\.[0-9a-f-]{36}\.report(?:\.v\d+)?\.pdf$/;

export type OrphanScan = {
  scanned: number;
  count: number;
  bytes: number;
  /** Contoh kunci, untuk ditampilkan di UI (dibatasi). */
  sample: string[];
  keys: string[];
};

/**
 * File di bucket yang tidak dirujuk database: naskah tanpa baris `documents`, salinan PDF laporan yang
 * naskahnya sudah tiada, dan sisa unggahan sementara. File pedoman di luar `guidelines/tmp/` tidak pernah disentuh.
 */
export async function findOrphans(
  db: Db,
  storage: StorageClient,
  now: Date = new Date(),
): Promise<OrphanScan> {
  if (!storage.listObjects)
    throw new AppError("Penyimpanan tidak mendukung pemindaian.", "not_supported", 400);
  const [objects, rows] = await Promise.all([
    storage.listObjects(),
    db.select({ key: documents.storageKey }).from(documents),
  ]);
  const known = new Set(rows.map((r) => r.key));
  const orphans = objects.filter((o) => {
    const age = now.getTime() - o.modifiedAt.getTime();
    if (o.key.startsWith("guidelines/tmp/")) return age > GUIDELINE_TMP_GRACE_MS;
    if (o.key.startsWith("guidelines/")) return false;
    if (age <= GRACE_MS) return false;
    if (known.has(o.key)) return false;
    const base = REPORT_COPY.exec(o.key)?.[1];
    return !(base && known.has(base));
  });
  return {
    scanned: objects.length,
    count: orphans.length,
    bytes: orphans.reduce((n, o) => n + o.size, 0),
    sample: orphans.slice(0, 5).map((o) => o.key),
    keys: orphans.map((o) => o.key),
  };
}

/** Pindai ulang di server lalu hapus; daftar dari klien tidak pernah dipercaya. Tercatat di log audit. */
export async function cleanOrphans(
  db: Db,
  storage: StorageClient,
  actorId: string,
  now: Date = new Date(),
): Promise<{ deleted: number; bytes: number }> {
  const scan = await findOrphans(db, storage, now);
  for (let i = 0; i < scan.keys.length; i += DELETE_BATCH)
    await storage.remove(scan.keys.slice(i, i + DELETE_BATCH));
  await access.writeAudit(db, actorId, "storage.clean_orphans", null, null, {
    deleted: scan.count,
    bytes: scan.bytes,
  });
  return { deleted: scan.count, bytes: scan.bytes };
}
