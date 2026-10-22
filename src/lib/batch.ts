import { t } from "@/lib/i18n/id";

/** Judul batch: "Batch 3", atau "Kode lama" untuk kelompok kode yang dibuat sebelum ada batch. */
export const batchTitle = (b: { number: number | null }): string =>
  b.number === null ? t.adminCodes.legacyBatch : t.adminCodes.batchName(b.number);
