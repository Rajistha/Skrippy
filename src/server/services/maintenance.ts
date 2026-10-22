/** Job harian. Setiap tugas idempoten dan aman dijalankan ulang. */
import "server-only";
import { and, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";
import type { AuthAdmin } from "../integrations/auth-admin";
import type { EmailClient } from "../integrations/email";
import type { StorageClient } from "../integrations/storage";
import * as access from "./access";
import * as thesesService from "./theses";

const { documents, theses, profiles, checkRuns, redeemAttempts, accessGrants } = schema;
const DAY = 86_400_000;
const REMINDER_WINDOW_MS = 3 * DAY;
const STUCK_MS = 10 * 60_000;
const ORPHAN_UPLOAD_MS = DAY;

export type MaintenanceReport = {
  retentionDocumentsDeleted: number;
  orphanUploadsDeleted: number;
  unusedAuthAccountsDeleted: number;
  stuckRunsFailed: number;
  redeemAttemptsPruned: number;
  remindersSent: number;
  /** Pengingat yang dilewati karena email belum dikonfigurasi. */
  remindersSkipped: number;
};

export async function ping(db: Db): Promise<void> {
  await db.execute(sql`select 1`);
}

/** Naskah yang tidak aktif lebih dari `retentionDays`: hapus file dan kosongkan kutipan temuan. */
export async function enforceRetention(
  db: Db,
  storage: StorageClient,
  retentionDays: number,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * DAY);
  const stale = await db
    .select({ id: documents.id, storageKey: documents.storageKey })
    .from(documents)
    .innerJoin(theses, eq(theses.id, documents.thesisId))
    .where(
      and(
        lt(theses.lastActivityAt, cutoff),
        isNull(documents.deletedAt),
        isNotNull(documents.sha256),
      ),
    );
  for (const doc of stale) await thesesService.deleteDocument(db, doc, storage, now);
  return stale.length;
}

/** Unggahan yang tidak pernah dikonfirmasi (sha256 kosong) lebih dari sehari. */
export async function cleanOrphanUploads(
  db: Db,
  storage: StorageClient,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - ORPHAN_UPLOAD_MS);
  const orphans = await db
    .select({ id: documents.id, storageKey: documents.storageKey })
    .from(documents)
    .where(and(isNull(documents.sha256), lt(documents.createdAt, cutoff)));
  if (orphans.length === 0) return 0;
  await storage.remove(orphans.map((o) => o.storageKey)).catch(() => undefined);
  await db.delete(documents).where(
    inArray(
      documents.id,
      orphans.map((o) => o.id),
    ),
  );
  return orphans.length;
}

/** Akun auth.users tanpa profil yang berumur lebih dari 7 hari. */
export async function deleteUnusedAuthAccounts(
  db: Db,
  authAdmin: AuthAdmin,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - 7 * DAY);
  const withProfile = new Set(
    (await db.select({ id: profiles.id }).from(profiles)).map((p) => p.id),
  );
  let deleted = 0;
  for (let page = 1; page <= 50; page++) {
    const { users, done } = await authAdmin.listUsers(page, 200);
    for (const u of users) {
      if (u.createdAt < cutoff && !withProfile.has(u.id)) {
        await authAdmin.deleteUser(u.id);
        deleted++;
      }
    }
    if (done) break;
  }
  return deleted;
}

/** Cek yang macet (processing atau queued lebih dari 10 menit) ditandai gagal dan jatahnya dikembalikan. */
export async function failStuckRuns(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - STUCK_MS);
  const stuck = await db
    .select({ id: checkRuns.id })
    .from(checkRuns)
    .where(
      or(
        and(eq(checkRuns.status, "processing"), lt(checkRuns.startedAt, cutoff)),
        and(eq(checkRuns.status, "queued"), lt(checkRuns.createdAt, cutoff)),
      ),
    );
  for (const run of stuck) {
    await db
      .update(checkRuns)
      .set({ status: "failed", errorCode: "timeout", finishedAt: now })
      .where(and(eq(checkRuns.id, run.id), inArray(checkRuns.status, ["queued", "processing"])));
    await access.refundCheck(db, run.id);
  }
  return stuck.length;
}

export async function pruneRedeemAttempts(db: Db, now: Date): Promise<number> {
  const rows = await db
    .delete(redeemAttempts)
    .where(lt(redeemAttempts.attemptedAt, new Date(now.getTime() - 7 * DAY)))
    .returning({ id: redeemAttempts.id });
  return rows.length;
}

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]; // prettier-ignore
const dateWib = (d: Date): string => {
  const l = new Date(d.getTime() + 7 * 3_600_000);
  return `${l.getUTCDate()} ${MONTHS[l.getUTCMonth()]} ${l.getUTCFullYear()}`;
};

/**
 * Email pengingat 3 hari sebelum akses berakhir (sekali per akses). Pengguna yang masih punya akses lain
 * yang berakhir lebih lama tidak diingatkan. Tanpa klien email, tugas dilewati dan dilaporkan.
 */
export async function sendExpiryReminders(
  db: Db,
  email: EmailClient | null,
  appBaseUrl: string,
  now: Date,
): Promise<{ sent: number; skipped: number }> {
  const horizon = new Date(now.getTime() + REMINDER_WINDOW_MS);
  const due = await db
    .select({ grant: accessGrants, email: profiles.email, name: profiles.fullName })
    .from(accessGrants)
    .innerJoin(profiles, eq(profiles.id, accessGrants.userId))
    .where(
      and(
        isNull(accessGrants.revokedAt),
        isNull(accessGrants.reminderSentAt),
        gt(accessGrants.endsAt, now),
        lte(accessGrants.endsAt, horizon),
        isNull(profiles.deactivatedAt),
        // Akun pemilik (akses puluhan tahun) tidak pernah masuk jendela ini; guard tambahan untuk akses tanpa batas praktis.
        lt(accessGrants.endsAt, new Date(now.getTime() + 365 * DAY)),
      ),
    );
  if (due.length === 0) return { sent: 0, skipped: 0 };
  if (!email) return { sent: 0, skipped: due.length };

  let sent = 0;
  const byUser = new Map<string, typeof due>();
  for (const row of due)
    byUser.set(row.grant.userId, [...(byUser.get(row.grant.userId) ?? []), row]);
  for (const [userId, rows] of byUser) {
    const latestDue = rows.reduce((a, b) => (a.grant.endsAt > b.grant.endsAt ? a : b));
    // Masih ada akses aktif yang berakhir lebih lama dari jendela pengingat: tidak perlu diingatkan.
    const [longer] = await db
      .select({ id: accessGrants.id })
      .from(accessGrants)
      .where(
        and(
          eq(accessGrants.userId, userId),
          isNull(accessGrants.revokedAt),
          gt(accessGrants.endsAt, horizon),
        ),
      )
      .limit(1);
    if (!longer) {
      const kind = latestDue.grant.kind === "package" ? "paket" : "trial";
      const greeting = latestDue.name ? `Halo ${latestDue.name.split(" ")[0]},` : "Halo,";
      try {
        await email.send({
          to: latestDue.email,
          subject: `Akses Skrippy kamu berakhir ${dateWib(latestDue.grant.endsAt)}`,
          text: [
            greeting,
            "",
            `Masa ${kind} Skrippy kamu berakhir pada ${dateWib(latestDue.grant.endsAt)}.`,
            "Untuk memperpanjang, minta kode paket ke pemilik lewat WhatsApp, lalu tukarkan di halaman Profil:",
            `${appBaseUrl.replace(/\/$/, "")}/profil`,
            "",
            "Naskah dan laporanmu tetap tersimpan sesuai kebijakan retensi.",
            "",
            "Skrippy",
          ].join("\n"),
        });
        sent++;
      } catch {
        // Gagal kirim: jangan tandai terkirim, coba lagi besok selama masih di jendela.
        continue;
      }
    }
    await db
      .update(accessGrants)
      .set({ reminderSentAt: now })
      .where(
        inArray(
          accessGrants.id,
          rows.map((r) => r.grant.id),
        ),
      );
  }
  return { sent, skipped: 0 };
}

export async function runMaintenance(
  deps: {
    db: Db;
    storage: StorageClient;
    authAdmin: AuthAdmin;
    retentionDays: number;
    email?: EmailClient | null;
    appBaseUrl?: string;
  },
  now: Date = new Date(),
): Promise<MaintenanceReport> {
  await ping(deps.db);
  const reminders = await sendExpiryReminders(
    deps.db,
    deps.email ?? null,
    deps.appBaseUrl ?? "http://localhost:3000",
    now,
  );
  return {
    retentionDocumentsDeleted: await enforceRetention(
      deps.db,
      deps.storage,
      deps.retentionDays,
      now,
    ),
    orphanUploadsDeleted: await cleanOrphanUploads(deps.db, deps.storage, now),
    unusedAuthAccountsDeleted: await deleteUnusedAuthAccounts(deps.db, deps.authAdmin, now),
    stuckRunsFailed: await failStuckRuns(deps.db, now),
    redeemAttemptsPruned: await pruneRedeemAttempts(deps.db, now),
    remindersSent: reminders.sent,
    remindersSkipped: reminders.skipped,
  };
}
