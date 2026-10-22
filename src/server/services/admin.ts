import "server-only";
import { and, count, desc, eq, gte, isNull, lte, sum } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";
import { getEnv } from "../env";
import { AppError, NotFound } from "../errors";
import type { AuthAdmin } from "../integrations/auth-admin";
import type { StorageClient } from "../integrations/storage";
import * as access from "./access";
import { deleteAccountData } from "./theses";

const { accessCodes, accessGrants, profiles, checkRuns, theses } = schema;

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]; // prettier-ignore

/** "3 November 2026" dalam WIB. */
export function formatIdDate(d: Date): string {
  const local = new Date(d.getTime() + 7 * 3_600_000);
  return `${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]} ${local.getUTCFullYear()}`;
}

function codeLabel(code: access.AccessCode, packageName: string): string {
  return code.kind === "trial"
    ? `Trial (${code.durationDays} hari, ${code.checkLimit} cek)`
    : `${packageName} (${code.durationDays} hari, cek tanpa batas)`;
}

/** Pesan WhatsApp siap kirim (docs/DESIGN.md 8.4). */
export function whatsappMessage(created: access.CreatedCode, packageName: string): string {
  const name = created.record.recipientNote?.trim();
  const base = getEnv().APP_BASE_URL.replace(/\/$/, "");
  return [
    `${name ? `Halo ${name}, ini` : "Halo, ini"} kode akses Skrippy kamu:`,
    "",
    created.plain,
    "",
    `Jenis: ${codeLabel(created.record, packageName)}`,
    ...(created.record.redeemBefore.getTime() - Date.now() < 20 * 365 * 86_400_000
      ? [`Pakai sebelum: ${formatIdDate(created.record.redeemBefore)}`]
      : []),
    `Buka: ${base}/masuk?kode=${created.plain}`,
    "",
    "Semoga lancar skripsinya!",
  ].join("\n");
}

export type CodeStatus = "active" | "used" | "expired" | "revoked";

export function codeStatus(code: access.AccessCode, now: Date): CodeStatus {
  if (code.revokedAt) return "revoked";
  if (code.redemptionCount >= code.maxRedemptions) return "used";
  if (code.redeemBefore.getTime() < now.getTime()) return "expired";
  return "active";
}

export async function listUsers(db: Db, now: Date = new Date()) {
  // Tiga query untuk seluruh daftar (bukan satu per pengguna): profil, semua grant, dan skripsi.
  const [rows, grants, owned] = await Promise.all([
    db.select().from(profiles).orderBy(desc(profiles.createdAt)),
    db.select().from(accessGrants),
    db
      .select({ ownerId: theses.ownerId, title: theses.title })
      .from(theses)
      .orderBy(desc(theses.lastActivityAt)),
  ]);
  const grantsBy = new Map<string, (typeof grants)[number][]>();
  for (const g of grants) grantsBy.set(g.userId, [...(grantsBy.get(g.userId) ?? []), g]);
  const titleBy = new Map<string, string>();
  for (const t of owned) if (!titleBy.has(t.ownerId)) titleBy.set(t.ownerId, t.title);
  return rows.map((p) => {
    const mine = grantsBy.get(p.id) ?? [];
    return {
      id: p.id,
      email: p.email,
      fullName: p.fullName,
      role: p.role,
      isOwner: isOwnerEmail(p.email),
      createdAt: p.createdAt,
      thesisTitle: titleBy.get(p.id) ?? null,
      access: access.accessStatusFromGrants(mine, now),
      checksUsed: mine.reduce((n, g) => n + g.checksUsed, 0),
    };
  });
}

export async function summary(db: Db, now: Date = new Date()) {
  const grants = await db
    .select({ userId: accessGrants.userId, kind: accessGrants.kind })
    .from(accessGrants)
    .innerJoin(profiles, eq(profiles.id, accessGrants.userId))
    .where(
      and(
        eq(profiles.role, "user"),
        isNull(accessGrants.revokedAt),
        lte(accessGrants.startsAt, now),
        gte(accessGrants.endsAt, now),
      ),
    );
  const packageUsers = new Set(grants.filter((g) => g.kind === "package").map((g) => g.userId));
  const trialUsers = new Set(
    grants.filter((g) => g.kind === "trial" && !packageUsers.has(g.userId)).map((g) => g.userId),
  );

  const local = new Date(now.getTime() + 7 * 3_600_000);
  const monthStart = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const [pay] = await db
    .select({ total: sum(accessCodes.priceIdr) })
    .from(accessCodes)
    .where(and(eq(accessCodes.kind, "package"), gte(accessCodes.paidOn, monthStart)));
  const [checks] = await db
    .select({ n: count() })
    .from(checkRuns)
    .where(
      and(
        gte(checkRuns.createdAt, new Date(now.getTime() - 7 * 86_400_000)),
        eq(checkRuns.countsTowardLimit, true),
      ),
    );

  return {
    activeUsers: packageUsers.size + trialUsers.size,
    activeTrials: trialUsers.size,
    activePackages: packageUsers.size,
    paymentsThisMonthIdr: Number(pay?.total ?? 0),
    checksLast7Days: checks?.n ?? 0,
  };
}

/** Akun pemilik (SUPERADMIN_EMAIL) selalu admin dan tidak bisa diubah dari aplikasi. */
export function isOwnerEmail(email: string): boolean {
  return email.trim().toLowerCase() === getEnv().SUPERADMIN_EMAIL.trim().toLowerCase();
}

export type Role = "user" | "superadmin";

/**
 * Ubah peran akun. Pengaman: tidak boleh mengubah akun sendiri atau akun pemilik, dan harus tersisa minimal
 * satu admin. Peran dicek di server pada setiap permintaan, jadi perubahan berlaku seketika.
 */
export async function setUserRole(db: Db, actorId: string, userId: string, role: Role) {
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(profiles).where(eq(profiles.id, userId)).for("update");
    if (!target) throw new NotFound("Pengguna tidak ditemukan.");
    if (target.id === actorId)
      throw new AppError("Kamu tidak bisa mengubah peran akunmu sendiri.", "role_self", 403);
    if (isOwnerEmail(target.email)) {
      throw new AppError("Peran akun pemilik tidak bisa diubah.", "role_owner", 403);
    }
    if (target.role === role) return target;
    if (role === "user") {
      const [admins] = await tx
        .select({ n: count() })
        .from(profiles)
        .where(eq(profiles.role, "superadmin"));
      if ((admins?.n ?? 0) <= 1)
        throw new AppError("Harus tersisa minimal satu admin.", "role_last_admin", 409);
    }
    const [updated] = await tx
      .update(profiles)
      .set({ role, updatedAt: new Date() })
      .where(eq(profiles.id, userId))
      .returning();
    await access.writeAudit(tx, actorId, "user.role_change", "profiles", userId, {
      from: target.role,
      to: role,
    });
    return updated!;
  });
}

/**
 * Hapus akun pengguna beserta seluruh naskah, laporan, dan aksesnya (sama seperti saat pengguna menghapus
 * akunnya sendiri), lalu akun loginnya. Tidak bisa dibatalkan.
 * Pengaman: bukan akun sendiri dan bukan akun pemilik.
 */
export async function deleteUserAccount(
  db: Db,
  deps: { storage: StorageClient; authAdmin: AuthAdmin },
  actorId: string,
  userId: string,
): Promise<void> {
  const [target] = await db.select().from(profiles).where(eq(profiles.id, userId));
  if (!target) throw new NotFound("Pengguna tidak ditemukan.");
  if (target.id === actorId) {
    throw new AppError("Kamu tidak bisa menghapus akunmu sendiri dari sini.", "delete_self", 403);
  }
  if (isOwnerEmail(target.email))
    throw new AppError("Akun pemilik tidak bisa dihapus.", "delete_owner", 403);
  // Dicatat sebelum data hilang, supaya jejaknya tetap ada bila langkah berikutnya gagal.
  await access.writeAudit(db, actorId, "user.delete", "profiles", userId, { email: target.email });
  await deleteAccountData(db, target, deps.storage);
  await deps.authAdmin.deleteUser(userId);
}
