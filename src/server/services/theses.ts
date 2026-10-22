import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull, max } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { parseDocx } from "../checkers/parse/document";
import type { Db } from "../db";
import { schema } from "../db";
import { getEnv } from "../env";
import { AppError, InvalidUpload, NotFound } from "../errors";
import type { StorageClient } from "../integrations/storage";
import { reportPdfKey } from "../reports/cache-key";
import type { Profile } from "./access";
import { DOCX_MIME, validateDocx } from "./file-validation";

const {
  theses,
  documents,
  guidelines,
  checkRuns,
  checkIssues,
  profiles,
  accessGrants,
  redeemAttempts,
} = schema;

export type Thesis = typeof theses.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;

export async function listGuidelines(db: Db) {
  return db
    .select({
      id: guidelines.id,
      name: guidelines.name,
      campusName: guidelines.campusName,
      version: guidelines.version,
      citationStyle: guidelines.citationStyle,
    })
    .from(guidelines)
    .where(eq(guidelines.status, "published"))
    .orderBy(guidelines.name);
}

export async function createThesis(
  db: Db,
  owner: Pick<Profile, "id">,
  input: { title: string; guidelineId: string },
): Promise<Thesis> {
  const [guideline] = await db
    .select()
    .from(guidelines)
    .where(eq(guidelines.id, input.guidelineId));
  if (!guideline || guideline.status !== "published") {
    throw new AppError("Pedoman tidak ditemukan.", "guideline_not_found");
  }
  const [thesis] = await db
    .insert(theses)
    .values({ ownerId: owner.id, guidelineId: input.guidelineId, title: input.title.trim() })
    .returning();
  return thesis!;
}

/** Pemilik atau superadmin. Selain itu 404, agar keberadaan data tidak bocor. */
export async function getOwnedThesis(
  db: Db,
  user: Pick<Profile, "id" | "role">,
  thesisId: string,
): Promise<Thesis> {
  const [thesis] = await db.select().from(theses).where(eq(theses.id, thesisId));
  if (!thesis || (thesis.ownerId !== user.id && user.role !== "superadmin")) {
    throw new NotFound("Skripsi tidak ditemukan.");
  }
  return thesis;
}

export async function getOwnedDocument(
  db: Db,
  user: Pick<Profile, "id" | "role">,
  documentId: string,
): Promise<{ document: DocumentRow; thesis: Thesis }> {
  const [document] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!document || document.deletedAt !== null) throw new NotFound("Naskah tidak ditemukan.");
  const thesis = await getOwnedThesis(db, user, document.thesisId);
  return { document, thesis };
}

export async function listTheses(db: Db, user: Pick<Profile, "id">): Promise<Thesis[]> {
  return db
    .select()
    .from(theses)
    .where(eq(theses.ownerId, user.id))
    .orderBy(desc(theses.lastActivityAt));
}

export type DocumentWithScore = DocumentRow & {
  latestScore: number | null;
  latestRunId: string | null;
};

export async function listDocuments(
  db: Db,
  thesis: Pick<Thesis, "id">,
): Promise<DocumentWithScore[]> {
  const docs = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.thesisId, thesis.id),
        isNull(documents.deletedAt),
        isNotNull(documents.sha256), // sudah dikonfirmasi
      ),
    )
    .orderBy(desc(documents.versionNo));
  if (docs.length === 0) return [];

  const runs = await db
    .select()
    .from(checkRuns)
    .where(
      and(
        inArray(
          checkRuns.documentId,
          docs.map((d) => d.id),
        ),
        eq(checkRuns.status, "completed"),
      ),
    )
    .orderBy(desc(checkRuns.createdAt));
  const latest = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!latest.has(r.documentId)) latest.set(r.documentId, r);

  return docs.map((d) => {
    const run = latest.get(d.id);
    return {
      ...d,
      latestScore: run?.scoreTotal != null ? Number(run.scoreTotal) : null,
      latestRunId: run?.id ?? null,
    };
  });
}

export async function startUpload(
  db: Db,
  user: Pick<Profile, "id">,
  thesis: Pick<Thesis, "id">,
  filename: string,
  storage: StorageClient,
): Promise<{ document: DocumentRow; uploadUrl: string }> {
  if (!filename.toLowerCase().endsWith(".docx"))
    throw new InvalidUpload("Hanya file .docx yang bisa diunggah.");
  const key = `${user.id}/${thesis.id}/${randomUUID()}.docx`;
  const document = await db.transaction(async (tx) => {
    // Kunci baris skripsi agar nomor versi tidak bentrok pada unggahan bersamaan.
    await tx.select({ id: theses.id }).from(theses).where(eq(theses.id, thesis.id)).for("update");
    const [last] = await tx
      .select({ n: max(documents.versionNo) })
      .from(documents)
      .where(eq(documents.thesisId, thesis.id));
    const [row] = await tx
      .insert(documents)
      .values({
        thesisId: thesis.id,
        versionNo: (last?.n ?? 0) + 1,
        originalFilename: filename.slice(0, 300),
        storageKey: key,
        mimeType: DOCX_MIME,
        sizeBytes: 0,
      })
      .returning();
    return row!;
  });
  return { document, uploadUrl: await storage.createSignedUploadUrl(key) };
}

/** Unduh file yang sudah diunggah browser, validasi di server, lalu isi metadata. */
export async function confirmUpload(
  db: Db,
  thesis: Pick<Thesis, "id">,
  document: DocumentRow,
  storage: StorageClient,
): Promise<DocumentRow> {
  const maxBytes = getEnv().MAX_UPLOAD_MB * 1024 * 1024;
  let data: Uint8Array;
  try {
    data = await storage.download(document.storageKey);
  } catch {
    throw new AppError("File belum terunggah. Coba unggah lagi.", "upload_missing");
  }

  const reject = async (): Promise<void> => {
    await storage.remove([document.storageKey]).catch(() => undefined);
    await db.delete(documents).where(eq(documents.id, document.id));
  };

  let wordCount: number;
  try {
    validateDocx(document.originalFilename, data, maxBytes);
    wordCount = parseDocx(data).wordCount;
  } catch (e) {
    await reject();
    if (e instanceof AppError) throw e;
    throw new InvalidUpload("File tidak bisa dibaca. Simpan ulang dari Word, lalu unggah lagi.");
  }

  const [updated] = await db
    .update(documents)
    .set({
      sizeBytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
      wordCount,
    })
    .where(eq(documents.id, document.id))
    .returning();
  await db.update(theses).set({ lastActivityAt: new Date() }).where(eq(theses.id, thesis.id));
  return updated!;
}

/** Soft delete: hapus file fisik dan kosongkan kutipan pada temuan terkait. */
export async function deleteDocument(
  db: Db,
  document: Pick<DocumentRow, "id" | "storageKey">,
  storage: StorageClient,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const runIds = tx
      .select({ id: checkRuns.id })
      .from(checkRuns)
      .where(eq(checkRuns.documentId, document.id));
    await tx
      .update(checkIssues)
      .set({ excerpt: null })
      .where(inArray(checkIssues.checkRunId, runIds));
    await tx.update(documents).set({ deletedAt: now }).where(eq(documents.id, document.id));
  });
  const runs = await db
    .select({ id: checkRuns.id })
    .from(checkRuns)
    .where(eq(checkRuns.documentId, document.id));
  await storage.remove([
    document.storageKey,
    ...runs.map((r) => reportPdfKey(document.storageKey, r.id)),
  ]);
}

export async function deleteThesis(
  db: Db,
  thesis: Pick<Thesis, "id">,
  storage: StorageClient,
): Promise<void> {
  // Termasuk unggahan yang belum dikonfirmasi, supaya tidak ada file yatim di storage.
  const live = await db
    .select()
    .from(documents)
    .where(and(eq(documents.thesisId, thesis.id), isNull(documents.deletedAt)));
  for (const doc of live) await deleteDocument(db, doc, storage);
  await db.delete(theses).where(eq(theses.id, thesis.id));
}

/** Hapus semua file dan data pribadi. Catatan pembayaran di access_codes tetap, tanpa tautan ke identitas. */
export async function deleteAccountData(
  db: Db,
  profile: Pick<Profile, "id">,
  storage: StorageClient,
): Promise<void> {
  const owned = await db.select().from(theses).where(eq(theses.ownerId, profile.id));
  for (const thesis of owned) await deleteThesis(db, thesis, storage);
  await db.transaction(async (tx) => {
    await tx.delete(redeemAttempts).where(eq(redeemAttempts.userId, profile.id));
    await tx.delete(accessGrants).where(eq(accessGrants.userId, profile.id));
    await tx.delete(profiles).where(eq(profiles.id, profile.id));
  });
}
