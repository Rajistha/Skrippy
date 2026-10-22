import "server-only";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { createHmac, randomBytes } from "node:crypto";
import type { SharedReport, ShareLink } from "@/lib/schemas";
import type { Db } from "../db";
import { schema } from "../db";
import { getEnv } from "../env";
import { AppError, NotFound } from "../errors";
import { issueOut } from "../mappers";
import { writeAudit } from "./access";
import { listIssues, type CheckRunRow } from "./checks";

const { shareLinks, documents, theses, checkRuns } = schema;

export const SHARE_TTL_DAYS = 14;
const MAX_ACTIVE_LINKS = 5;
const DAY_MS = 86_400_000;

/** Token acak 256 bit. Hanya hash-nya yang disimpan; token asli dikembalikan satu kali. */
export const hashToken = (token: string): string =>
  createHmac("sha256", getEnv().ACCESS_CODE_HMAC_SECRET).update(`share:${token}`).digest("hex");

const toLink = (row: typeof shareLinks.$inferSelect): ShareLink => ({
  id: row.id,
  expires_at: row.expiresAt.toISOString(),
  created_at: row.createdAt.toISOString(),
});

export async function listActiveLinks(
  db: Db,
  run: Pick<CheckRunRow, "id">,
  now: Date = new Date(),
): Promise<ShareLink[]> {
  const rows = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.checkRunId, run.id),
        isNull(shareLinks.revokedAt),
        gt(shareLinks.expiresAt, now),
      ),
    )
    .orderBy(desc(shareLinks.createdAt));
  return rows.map(toLink);
}

export async function createShareLink(
  db: Db,
  userId: string,
  run: Pick<CheckRunRow, "id" | "status">,
  now: Date = new Date(),
): Promise<{ link: ShareLink; token: string }> {
  if (run.status !== "completed")
    throw new AppError("Laporan belum selesai, belum bisa dibagikan.", "run_not_ready");
  if ((await listActiveLinks(db, run, now)).length >= MAX_ACTIVE_LINKS) {
    throw new AppError(
      `Maksimal ${MAX_ACTIVE_LINKS} tautan aktif per laporan. Cabut salah satu dulu.`,
      "share_limit",
    );
  }
  const token = randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(shareLinks)
    .values({
      checkRunId: run.id,
      createdBy: userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + SHARE_TTL_DAYS * DAY_MS),
    })
    .returning();
  await writeAudit(db, userId, "share.create", "share_links", row!.id);
  return { link: toLink(row!), token };
}

export async function revokeShareLink(
  db: Db,
  userId: string,
  run: Pick<CheckRunRow, "id">,
  linkId: string,
  now: Date = new Date(),
): Promise<void> {
  const updated = await db
    .update(shareLinks)
    .set({ revokedAt: now })
    .where(
      and(
        eq(shareLinks.id, linkId),
        eq(shareLinks.checkRunId, run.id),
        isNull(shareLinks.revokedAt),
      ),
    )
    .returning({ id: shareLinks.id });
  if (updated.length === 0) throw new NotFound("Tautan tidak ditemukan.");
  await writeAudit(db, userId, "share.revoke", "share_links", linkId);
}

/**
 * Laporan untuk pembaca tautan. Tautan tidak dikenal, dicabut, atau kedaluwarsa memberi respons
 * yang sama (404) agar tidak membocorkan keberadaan tautan. Tidak memuat data pemilik.
 */
export async function getSharedReport(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<SharedReport> {
  const invalid = () => new NotFound("Tautan tidak valid atau sudah tidak berlaku.");
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.tokenHash, hashToken(token)));
  if (!link || link.revokedAt !== null || link.expiresAt.getTime() <= now.getTime())
    throw invalid();
  const [run] = await db.select().from(checkRuns).where(eq(checkRuns.id, link.checkRunId));
  if (!run || run.status !== "completed") throw invalid();
  const [doc] = await db
    .select({ versionNo: documents.versionNo, title: theses.title })
    .from(documents)
    .innerJoin(theses, eq(theses.id, documents.thesisId))
    .where(eq(documents.id, run.documentId));
  const issues = await listIssues(db, run);
  return {
    thesis_title: doc?.title ?? "",
    version_no: doc?.versionNo ?? 1,
    checked_at: (run.finishedAt ?? run.createdAt).toISOString(),
    expires_at: link.expiresAt.toISOString(),
    score_total: run.scoreTotal === null ? null : Number(run.scoreTotal),
    score_by_category: run.scoreByCategory ?? {},
    issues: issues
      .filter((i) => i.userStatus !== "false_positive")
      .map((i) => ({ ...issueOut(i), user_status: "open" as const })),
  };
}
