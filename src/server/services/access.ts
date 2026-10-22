/** Seluruh logika akses. Route Handler dan modul lain tidak menghitung sendiri hak akses. */
import "server-only";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  max,
  notInArray,
  sql,
} from "drizzle-orm";
import { createHmac, randomInt } from "node:crypto";
import type { Db, Executor } from "../db";
import { schema } from "../db";
import { getEnv } from "../env";
import { encryptSecret } from "../integrations/secrets";
import {
  AppError,
  CheckNotAllowed,
  InvalidAccessCode,
  NotFound,
  RateLimited,
  TrialAlreadyUsed,
} from "../errors";

const {
  profiles,
  accessCodes,
  accessGrants,
  appSettings,
  auditLogs,
  checkRuns,
  codeBatches,
  redeemAttempts,
} = schema;

export type Profile = typeof profiles.$inferSelect;
export type AccessGrant = typeof accessGrants.$inferSelect;
export type AccessCode = typeof accessCodes.$inferSelect;

const DAY_MS = 86_400_000;
const WIB_OFFSET_MS = 7 * 3_600_000; // Asia/Jakarta tetap UTC+7, tanpa DST

/** Tanpa karakter mirip: O, 0, I, 1, L. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_PREFIX = "SKR";

export const DEFAULT_SETTINGS = {
  "trial.enabled": 1,
  "trial.duration_days": 7,
  "trial.check_limit": 3,
  "trial.daily_check_limit": 3,
  "package.enabled": 1,
  "package.name": "Paket Skripsi",
  "package.price_idr": 25000,
  "package.duration_days": 30,
  "package.daily_check_limit": 20,
  "code.redeem_window_days": 14,
  "contact.whatsapp": "",
  "ai.enabled": 0,
  "ai.provider": "anthropic",
  "ai.base_url": "",
  "ai.model": "claude-haiku-4-5-20251001",
  "ai.daily_limit": 3,
  "ai.max_chars": 120000,
  "ai.allow_trial": 0,
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type Settings = {
  [K in SettingKey]: (typeof DEFAULT_SETTINGS)[K] extends number ? number : string;
};

const REDEEM_LIMIT = 5;
const REDEEM_WINDOW_MS = 15 * 60_000;

// --- kode ---------------------------------------------------------------------

export function generateCode(): string {
  let body = "";
  for (let i = 0; i < 8; i++) body += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
}

/** Huruf kapital, buang spasi dan tanda hubung, tambahkan kembali prefiks. */
export function normalizeCode(raw: string): string {
  let compact = raw.replace(/[\s-]/g, "").toUpperCase();
  if (!compact.startsWith(CODE_PREFIX)) compact = CODE_PREFIX + compact;
  return `${CODE_PREFIX}-${compact.slice(3, 7)}-${compact.slice(7)}`;
}

export function hashCode(raw: string): string {
  return createHmac("sha256", getEnv().ACCESS_CODE_HMAC_SECRET)
    .update(normalizeCode(raw))
    .digest("hex");
}

// --- waktu --------------------------------------------------------------------

/** Awal dan akhir hari kalender WIB yang memuat `now`, dalam UTC. */
export function wibDayBounds(now: Date): { start: Date; end: Date } {
  const local = now.getTime() + WIB_OFFSET_MS;
  const startLocal = Math.floor(local / DAY_MS) * DAY_MS;
  const start = startLocal - WIB_OFFSET_MS;
  return { start: new Date(start), end: new Date(start + DAY_MS) };
}

const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * DAY_MS);

// --- pengaturan dan audit ----------------------------------------------------------

export async function getAppSettings(db: Executor): Promise<Settings> {
  const rows = await db.select().from(appSettings);
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    // Nilai yang diisi manual lewat SQL bisa bertipe lain (mis. nomor WhatsApp sebagai angka): samakan dengan tipe bawaan.
    const base = DEFAULT_SETTINGS[r.key as SettingKey];
    if (typeof base === "string") merged[r.key] = r.value == null ? base : String(r.value);
    else if (typeof base === "number")
      merged[r.key] = Number.isFinite(Number(r.value)) ? Number(r.value) : base;
    else merged[r.key] = r.value;
  }
  return merged as Settings;
}

export async function writeAudit(
  db: Executor,
  actorId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db
    .insert(auditLogs)
    .values({ actorId, action, targetType, targetId, metadata: metadata ?? null });
}

/**
 * Batas cek mengikuti Pengaturan: bila diubah, semua akses yang masih berjalan ikut berubah.
 * Durasi tidak ikut (masa akses yang sudah diberikan tidak diubah) dan akun admin dibiarkan.
 */
async function applyLimitsToActiveGrants(
  tx: Executor,
  changes: Record<string, unknown>,
): Promise<void> {
  const now = new Date();
  const live = and(
    isNull(accessGrants.revokedAt),
    gte(accessGrants.endsAt, now),
    notInArray(
      accessGrants.userId,
      tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.role, "superadmin")),
    ),
  );
  const packageDaily = changes["package.daily_check_limit"];
  if (typeof packageDaily === "number") {
    await tx
      .update(accessGrants)
      .set({ dailyCheckLimit: packageDaily })
      .where(and(live, eq(accessGrants.kind, "package")));
  }
  const trialDaily = changes["trial.daily_check_limit"];
  if (typeof trialDaily === "number") {
    await tx
      .update(accessGrants)
      .set({ dailyCheckLimit: trialDaily })
      .where(and(live, eq(accessGrants.kind, "trial")));
  }
  const trialTotal = changes["trial.check_limit"];
  if (typeof trialTotal === "number") {
    await tx
      .update(accessGrants)
      .set({ checkLimit: trialTotal })
      .where(and(live, eq(accessGrants.kind, "trial")));
  }
}

export async function updateSettings(
  db: Db,
  actorId: string,
  changes: Record<string, unknown>,
): Promise<Settings> {
  const unknown = Object.keys(changes).filter((k) => !(k in DEFAULT_SETTINGS));
  if (unknown.length > 0)
    throw new AppError(`Pengaturan tidak dikenal: ${unknown.sort().join(", ")}`);
  for (const [key, value] of Object.entries(changes)) {
    const base = DEFAULT_SETTINGS[key as SettingKey];
    if (
      typeof base !== typeof value ||
      (typeof value === "number" && (!Number.isFinite(value) || value < 0))
    ) {
      throw new AppError(`Nilai pengaturan ${key} tidak valid.`);
    }
  }
  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(changes)) {
      await tx
        .insert(appSettings)
        .values({ key, value, updatedBy: actorId })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value, updatedBy: actorId, updatedAt: new Date() },
        });
    }
    await applyLimitsToActiveGrants(tx, changes);
    await writeAudit(tx, actorId, "settings.update", "app_settings", null, {
      keys: Object.keys(changes).sort(),
    });
  });
  return getAppSettings(db);
}

// --- admin: kode ------------------------------------------------------------------

export type CreateCodesInput = {
  kind: "trial" | "package";
  count?: number;
  /** Kuota pakai per kode: berapa orang berbeda yang boleh menukarnya. */
  maxRedemptions?: number;
  /** Batas terakhir kode boleh ditukar. Kosong: tanpa batas waktu. */
  validUntil?: Date | null;
  recipientNote?: string | null;
  priceIdr?: number | null;
  paymentMethod?: "transfer" | "qris" | "tunai" | null;
  paidOn?: string | null;
  paymentNote?: string | null;
};

export type CreatedCode = { plain: string; record: AccessCode };

export const MAX_CODES_PER_BATCH = 500;
export const MAX_REDEMPTIONS_PER_CODE = 1000;
/** "Tanpa batas waktu" disimpan sebagai tanggal sangat jauh (kolom tidak boleh kosong). */
const NO_EXPIRY_DAYS = 365 * 100;

export async function createCodes(
  db: Db,
  actorId: string,
  input: CreateCodesInput,
  now: Date = new Date(),
): Promise<CreatedCode[]> {
  const count = input.count ?? 1;
  const maxRedemptions = input.maxRedemptions ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > MAX_CODES_PER_BATCH) {
    throw new AppError(`Jumlah kode antara 1 sampai ${MAX_CODES_PER_BATCH}.`);
  }
  if (
    !Number.isInteger(maxRedemptions) ||
    maxRedemptions < 1 ||
    maxRedemptions > MAX_REDEMPTIONS_PER_CODE
  ) {
    throw new AppError(`Kuota pakai per kode antara 1 sampai ${MAX_REDEMPTIONS_PER_CODE}.`);
  }
  if (input.validUntil && input.validUntil.getTime() <= now.getTime()) {
    throw new AppError("Tanggal berlaku sampai harus di masa depan.");
  }
  const cfg = await getAppSettings(db);
  const isTrial = input.kind === "trial";
  const redeemBefore = input.validUntil ?? addDays(now, NO_EXPIRY_DAYS);

  // Kode acak dibuat dulu dan dijamin unik di dalam batch; satu INSERT untuk seluruh batch
  // (ratusan INSERT satu per satu terlalu lambat lewat pooler).
  const plains = new Set<string>();
  while (plains.size < count) plains.add(generateCode());

  return db.transaction(async (tx) => {
    // Nomor batch berurutan; kunci penasihat mencegah dua batch bersamaan mendapat nomor yang sama.
    await tx.execute(sql`select pg_advisory_xact_lock(420001)`);
    const [last] = await tx.select({ n: max(codeBatches.number) }).from(codeBatches);
    const [batch] = await tx
      .insert(codeBatches)
      .values({
        number: (last?.n ?? 0) + 1,
        note: input.recipientNote?.trim() || null,
        createdBy: actorId,
      })
      .returning();
    // Nilai pengaturan disalin ke kode: mengubah pengaturan tidak memengaruhi kode yang sudah dibagikan.
    const rows = [...plains].map((plain) => ({
      batchId: batch!.id,
      codeHash: hashCode(plain),
      codeHint: plain.slice(-4),
      codeEncrypted: encryptSecret(plain, getEnv().ACCESS_CODE_HMAC_SECRET),
      kind: input.kind,
      durationDays: isTrial ? cfg["trial.duration_days"] : cfg["package.duration_days"],
      checkLimit: isTrial ? cfg["trial.check_limit"] : null,
      dailyCheckLimit: isTrial ? cfg["trial.daily_check_limit"] : cfg["package.daily_check_limit"],
      maxRedemptions,
      redeemBefore,
      recipientNote: input.recipientNote?.trim() || null,
      priceIdr: isTrial ? null : (input.priceIdr ?? null),
      paymentMethod: isTrial ? null : (input.paymentMethod ?? null),
      paidOn: isTrial ? null : (input.paidOn ?? null),
      paymentNote: isTrial ? null : (input.paymentNote ?? null),
      createdBy: actorId,
    }));
    const records = await tx.insert(accessCodes).values(rows).returning();
    const byHash = new Map(records.map((r) => [r.codeHash, r]));
    await writeAudit(tx, actorId, "code.create", "access_codes", null, {
      kind: input.kind,
      count,
      max_redemptions: maxRedemptions,
    });
    return [...plains].map((plain) => ({ plain, record: byHash.get(hashCode(plain))! }));
  });
}

/**
 * Hapus kode-kode permanen di dalam transaksi. Akses yang berasal dari kode itu dicabut seketika
 * (pengguna tidak lagi punya akses itu), tetapi baris akses dan riwayat cek mereka tetap ada karena
 * laporan terhubung ke akses tersebut. Akses dari kode lain atau trial tidak tersentuh.
 */
async function removeCodes(
  tx: Executor,
  codes: AccessCode[],
  now: Date,
): Promise<{ usersAffected: number }> {
  const ids = codes.map((c) => c.id);
  if (ids.length === 0) return { usersAffected: 0 };
  const grants = await tx
    .select()
    .from(accessGrants)
    .where(inArray(accessGrants.accessCodeId, ids))
    .for("update");
  const stillActive = grants.filter(
    (g) => g.revokedAt === null && g.endsAt.getTime() > now.getTime(),
  );
  if (grants.length > 0) {
    await tx
      .update(accessGrants)
      .set({ revokedAt: now, revokeReason: "Kode akses dihapus", accessCodeId: null })
      .where(inArray(accessGrants.accessCodeId, ids));
  }
  await tx.delete(accessCodes).where(inArray(accessCodes.id, ids));
  return { usersAffected: new Set(stillActive.map((g) => g.userId)).size };
}

/** Hapus satu kode. Batch yang menjadi kosong ikut dibersihkan. Mengembalikan jumlah pengguna yang kehilangan akses. */
export async function deleteCode(
  db: Db,
  actorId: string,
  codeId: string,
  now: Date = new Date(),
): Promise<{ usersAffected: number }> {
  return db.transaction(async (tx) => {
    const [code] = await tx
      .select()
      .from(accessCodes)
      .where(eq(accessCodes.id, codeId))
      .for("update");
    if (!code) throw new NotFound("Kode tidak ditemukan.");
    const { usersAffected } = await removeCodes(tx, [code], now);
    if (code.batchId) {
      const [left] = await tx
        .select({ n: count() })
        .from(accessCodes)
        .where(eq(accessCodes.batchId, code.batchId));
      if ((left?.n ?? 0) === 0)
        await tx.delete(codeBatches).where(eq(codeBatches.id, code.batchId));
    }
    await writeAudit(tx, actorId, "code.delete", "access_codes", codeId, {
      code_hint: code.codeHint,
      redemptions: code.redemptionCount,
      users_affected: usersAffected,
    });
    return { usersAffected };
  });
}

/** Cabut seluruh batch: semua kodenya dihapus dan akses yang berasal darinya ikut dicabut. */
export async function deleteBatch(
  db: Db,
  actorId: string,
  batchId: string,
  now: Date = new Date(),
): Promise<{ codesDeleted: number; usersAffected: number }> {
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(codeBatches)
      .where(eq(codeBatches.id, batchId))
      .for("update");
    if (!batch) throw new NotFound("Batch tidak ditemukan.");
    const codes = await tx
      .select()
      .from(accessCodes)
      .where(eq(accessCodes.batchId, batchId))
      .for("update");
    const { usersAffected } = await removeCodes(tx, codes, now);
    await tx.delete(codeBatches).where(eq(codeBatches.id, batchId));
    await writeAudit(tx, actorId, "code.batch_delete", "code_batches", batchId, {
      number: batch.number,
      codes: codes.length,
      users_affected: usersAffected,
    });
    return { codesDeleted: codes.length, usersAffected };
  });
}

export async function revokeCode(
  db: Db,
  actorId: string,
  codeId: string,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [code] = await tx
      .select()
      .from(accessCodes)
      .where(eq(accessCodes.id, codeId))
      .for("update");
    if (!code) throw new NotFound("Kode tidak ditemukan.");
    if (code.redemptionCount > 0)
      throw new AppError("Kode yang sudah dipakai tidak bisa dicabut. Hentikan aksesnya.");
    await tx.update(accessCodes).set({ revokedAt: now }).where(eq(accessCodes.id, codeId));
    await writeAudit(tx, actorId, "code.revoke", "access_codes", codeId);
  });
}

// --- akses aktif ----------------------------------------------------------------

export async function activeGrants(
  db: Executor,
  userId: string,
  now: Date,
  opts: { lock?: boolean } = {},
): Promise<AccessGrant[]> {
  const query = db
    .select()
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.userId, userId),
        isNull(accessGrants.revokedAt),
        lte(accessGrants.startsAt, now),
        gte(accessGrants.endsAt, now),
      ),
    )
    .orderBy(desc(accessGrants.endsAt));
  return opts.lock ? query.for("update") : query;
}

/** Yang berakhir paling akhir; paket diprioritaskan di atas trial. */
export function pickGrant(grants: AccessGrant[]): AccessGrant | undefined {
  const packages = grants.filter((g) => g.kind === "package");
  const pool = packages.length > 0 ? packages : grants;
  return pool.reduce<AccessGrant | undefined>(
    (best, g) => (!best || g.endsAt.getTime() > best.endsAt.getTime() ? g : best),
    undefined,
  );
}

// --- menukar kode ----------------------------------------------------------------

export type TokenClaims = {
  userId: string;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
};

/** Batas 5 percobaan per 15 menit per akun, dicatat di tabel agar tidak butuh Redis. */
async function recordAttempt(db: Db, userId: string, now: Date): Promise<string> {
  const since = new Date(now.getTime() - REDEEM_WINDOW_MS);
  const [row] = await db
    .select({ n: count() })
    .from(redeemAttempts)
    .where(and(eq(redeemAttempts.userId, userId), gte(redeemAttempts.attemptedAt, since)));
  if ((row?.n ?? 0) >= REDEEM_LIMIT) throw new RateLimited();
  // Dicatat di luar transaksi penukaran agar percobaan gagal tetap tersimpan setelah rollback.
  const [attempt] = await db
    .insert(redeemAttempts)
    .values({ userId, success: false, attemptedAt: now })
    .returning();
  return attempt!.id;
}

export async function redeemCode(
  db: Db,
  claims: TokenClaims,
  rawCode: string,
  now: Date = new Date(),
): Promise<AccessGrant> {
  const attemptId = await recordAttempt(db, claims.userId, now);
  const hash = hashCode(rawCode);

  const grant = await db.transaction(async (tx) => {
    // Profil baru dibuat di sini; onConflictDoNothing menjaga dua permintaan bersamaan dari akun baru.
    await tx
      .insert(profiles)
      .values({
        id: claims.userId,
        email: claims.email,
        fullName: claims.fullName ?? null,
        avatarUrl: claims.avatarUrl ?? null,
      })
      .onConflictDoNothing();
    // Baris kode dikunci lebih dulu: dua penukar kode yang sama diserialkan di sini.
    const [code] = await tx
      .select()
      .from(accessCodes)
      .where(eq(accessCodes.codeHash, hash))
      .for("update");
    const [profile] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, claims.userId))
      .for("update");

    if (
      !code ||
      code.revokedAt !== null ||
      code.redeemBefore.getTime() < now.getTime() ||
      code.redemptionCount >= code.maxRedemptions
    ) {
      throw new InvalidAccessCode();
    }
    // Kode berkuota banyak boleh dipakai beberapa orang, tetapi tidak berkali-kali oleh orang yang sama
    // (kalau tidak, satu orang bisa menghabiskan kuota dan menumpuk masa aktif).
    const [already] = await tx
      .select({ id: accessGrants.id })
      .from(accessGrants)
      .where(and(eq(accessGrants.userId, claims.userId), eq(accessGrants.accessCodeId, code.id)))
      .limit(1);
    if (already) throw new InvalidAccessCode();

    let startsAt = now;
    let endsAt: Date;
    if (code.kind === "trial") {
      if (profile!.trialUsed) throw new TrialAlreadyUsed();
      await tx.update(profiles).set({ trialUsed: true }).where(eq(profiles.id, claims.userId));
      endsAt = addDays(now, code.durationDays);
    } else {
      const current = await activeGrants(tx, claims.userId, now, { lock: true });
      const activePackage = pickGrant(current.filter((g) => g.kind === "package"));
      if (activePackage) {
        // Perpanjangan: tambahkan ke akhir paket aktif, bukan dari hari ini.
        endsAt = addDays(activePackage.endsAt, code.durationDays);
      } else {
        endsAt = addDays(now, code.durationDays);
        for (const trial of current.filter((g) => g.kind === "trial")) {
          await tx
            .update(accessGrants)
            .set({ revokedAt: now, revokeReason: "upgrade" })
            .where(eq(accessGrants.id, trial.id));
        }
      }
      startsAt = now;
    }

    // Kode hanya memberi masa akses. Batas cek selalu dari Pengaturan saat ini.
    const cfg = await getAppSettings(tx);
    const isTrialCode = code.kind === "trial";
    const [created] = await tx
      .insert(accessGrants)
      .values({
        userId: claims.userId,
        accessCodeId: code.id,
        kind: code.kind,
        startsAt,
        endsAt,
        checkLimit: isTrialCode ? cfg["trial.check_limit"] : null,
        dailyCheckLimit: isTrialCode
          ? cfg["trial.daily_check_limit"]
          : cfg["package.daily_check_limit"],
      })
      .returning();
    await tx
      .update(accessCodes)
      .set({ redemptionCount: sql`${accessCodes.redemptionCount} + 1` })
      .where(eq(accessCodes.id, code.id));
    await tx.update(redeemAttempts).set({ success: true }).where(eq(redeemAttempts.id, attemptId));
    return created!;
  });
  return grant;
}

/** Email SUPERADMIN_EMAIL mendapat profil superadmin otomatis saat pertama masuk. */
export async function ensureSuperadminProfile(
  db: Db,
  claims: TokenClaims,
  now: Date = new Date(),
): Promise<Profile | null> {
  const configured = getEnv().SUPERADMIN_EMAIL.trim().toLowerCase();
  if (claims.email.trim().toLowerCase() !== configured) return null;
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(profiles).where(eq(profiles.id, claims.userId));
    if (existing) return existing;
    const [profile] = await tx
      .insert(profiles)
      .values({
        id: claims.userId,
        email: claims.email,
        fullName: claims.fullName ?? null,
        avatarUrl: claims.avatarUrl ?? null,
        role: "superadmin",
        trialUsed: true,
      })
      .returning();
    // Pemilik tidak ditahan jatah: grant paket tanpa batas jumlah cek dan berumur panjang.
    await tx.insert(accessGrants).values({
      userId: claims.userId,
      kind: "package",
      startsAt: now,
      endsAt: addDays(now, 365 * 50),
      checkLimit: null,
      dailyCheckLimit: 1000,
    });
    return profile!;
  });
}

/**
 * Trial hanya bila admin menyalakannya (`trial.enabled`). Nilai durasi dan batas disalin ke grant.
 * Pengguna yang belum pernah punya akses apa pun mendapat satu trial, sekali seumur akun (`trial_used`).
 * Aman dipanggil bersamaan dan berulang: baris profil dikunci dan syaratnya dicek ulang di dalam transaksi.
 */
export async function grantTrialIfEligible(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(profiles).where(eq(profiles.id, userId)).for("update");
    if (!profile || profile.role !== "user" || profile.trialUsed) return false;
    const settings = await getAppSettings(tx);
    if (settings["trial.enabled"] !== 1) return false;
    // Sudah punya akses dari kode (atau akses lain): trial tidak diberikan.
    const [any] = await tx
      .select({ id: accessGrants.id })
      .from(accessGrants)
      .where(eq(accessGrants.userId, userId))
      .limit(1);
    if (any) return false;
    await tx.insert(accessGrants).values({
      userId,
      kind: "trial",
      startsAt: now,
      endsAt: addDays(now, settings["trial.duration_days"]),
      checkLimit: settings["trial.check_limit"],
      dailyCheckLimit: settings["trial.daily_check_limit"],
    });
    await tx.update(profiles).set({ trialUsed: true }).where(eq(profiles.id, userId));
    return true;
  });
}

/**
 * Profil untuk pengguna yang pertama kali masuk. Trial diberikan hanya bila dinyalakan; bila dimatikan,
 * pengguna masuk tanpa akses dan harus menukar kode paket (halaman lain terkunci di UI).
 */
export async function ensureUserProfile(
  db: Db,
  claims: TokenClaims,
  now: Date = new Date(),
): Promise<Profile> {
  const superadmin = await ensureSuperadminProfile(db, claims, now);
  if (superadmin) return superadmin;
  await db
    .insert(profiles)
    .values({
      id: claims.userId,
      email: claims.email,
      fullName: claims.fullName ?? null,
      avatarUrl: claims.avatarUrl ?? null,
    })
    .onConflictDoNothing();
  await grantTrialIfEligible(db, claims.userId, now);
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, claims.userId));
  return profile!;
}

// --- menjalankan cek -----------------------------------------------------------------

export async function checksToday(db: Executor, userId: string, now: Date): Promise<number> {
  const { start, end } = wibDayBounds(now);
  const [row] = await db
    .select({ n: count() })
    .from(checkRuns)
    .where(
      and(
        eq(checkRuns.requestedBy, userId),
        eq(checkRuns.countsTowardLimit, true),
        gte(checkRuns.createdAt, start),
        lt(checkRuns.createdAt, end),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Kunci grant aktif, periksa syarat, kembalikan grant yang akan dipakai.
 * Panggil di dalam transaksi yang sama dengan pembuatan check_run, lalu `consumeCheck`.
 */
export async function ensureCanRunCheck(
  tx: Executor,
  profile: Pick<Profile, "id">,
  now: Date = new Date(),
): Promise<AccessGrant> {
  const grant = pickGrant(await activeGrants(tx, profile.id, now, { lock: true }));
  if (!grant) {
    throw new CheckNotAllowed(
      "Akses kamu sudah berakhir. Tukar kode baru atau hubungi pemilik.",
      "access_expired",
    );
  }
  if (grant.checkLimit !== null && grant.checksUsed >= grant.checkLimit) {
    throw new CheckNotAllowed(
      "Jatah cek trial kamu sudah habis. Tukar kode paket untuk lanjut.",
      "check_limit_reached",
    );
  }
  if ((await checksToday(tx, profile.id, now)) >= grant.dailyCheckLimit) {
    throw new CheckNotAllowed(
      `Batas ${grant.dailyCheckLimit} cek per hari sudah tercapai. Coba lagi besok.`,
      "daily_limit_reached",
    );
  }
  return grant;
}

export async function consumeCheck(tx: Executor, grantId: string): Promise<void> {
  await tx
    .update(accessGrants)
    .set({ checksUsed: sql`${accessGrants.checksUsed} + 1` })
    .where(eq(accessGrants.id, grantId));
}

/** Cek gagal karena sistem tidak memakai jatah. Idempoten. */
export async function refundCheck(db: Db, runId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [run] = await tx.select().from(checkRuns).where(eq(checkRuns.id, runId)).for("update");
    if (!run || !run.countsTowardLimit) return;
    await tx.update(checkRuns).set({ countsTowardLimit: false }).where(eq(checkRuns.id, runId));
    await tx
      .update(accessGrants)
      .set({ checksUsed: sql`GREATEST(${accessGrants.checksUsed} - 1, 0)` })
      .where(eq(accessGrants.id, run.accessGrantId));
  });
}

// --- admin: akses pengguna -------------------------------------------------------

export async function extendAccess(
  db: Db,
  actorId: string,
  userId: string,
  input: { days: number; reason: string },
  now: Date = new Date(),
): Promise<AccessGrant> {
  if (!Number.isInteger(input.days) || input.days < 1)
    throw new AppError("Jumlah hari harus lebih dari 0.");
  if (!input.reason.trim()) throw new AppError("Alasan wajib diisi.");
  const cfg = await getAppSettings(db);
  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) throw new NotFound("Pengguna tidak ditemukan.");
    const current = pickGrant(await activeGrants(tx, userId, now, { lock: true }));
    const base = current ? current.endsAt : now;
    const [grant] = await tx
      .insert(accessGrants)
      .values({
        userId,
        accessCodeId: null,
        kind: "package",
        startsAt: now,
        endsAt: addDays(base, input.days),
        checkLimit: null,
        dailyCheckLimit: cfg["package.daily_check_limit"],
      })
      .returning();
    await writeAudit(tx, actorId, "grant.extend", "access_grants", grant!.id, {
      days: input.days,
      reason: input.reason,
    });
    return grant!;
  });
}

export async function stopAccess(
  db: Db,
  actorId: string,
  userId: string,
  input: { reason: string },
  now: Date = new Date(),
): Promise<number> {
  if (!input.reason.trim()) throw new AppError("Alasan wajib diisi.");
  return db.transaction(async (tx) => {
    const grants = await activeGrants(tx, userId, now, { lock: true });
    for (const g of grants) {
      await tx
        .update(accessGrants)
        .set({ revokedAt: now, revokeReason: input.reason })
        .where(eq(accessGrants.id, g.id));
      await writeAudit(tx, actorId, "grant.stop", "access_grants", g.id, { reason: input.reason });
    }
    return grants.length;
  });
}

// --- status untuk UI -------------------------------------------------------------------

export type AccessStatus = {
  state: "none" | "trial" | "package" | "expired";
  endsAt: Date | null;
  daysLeft: number | null;
  checksLeft: number | null;
  dailyLimit: number | null;
};

/** Status akses dari daftar grant satu pengguna. Murni, supaya daftar pengguna cukup satu query. */
export function accessStatusFromGrants(all: AccessGrant[], now: Date): AccessStatus {
  const grant = pickGrant(
    all.filter(
      (g) =>
        g.revokedAt === null &&
        g.startsAt.getTime() <= now.getTime() &&
        g.endsAt.getTime() >= now.getTime(),
    ),
  );
  if (!grant) {
    return {
      state: all.length > 0 ? "expired" : "none",
      endsAt: null,
      daysLeft: null,
      checksLeft: null,
      dailyLimit: null,
    };
  }
  return {
    state: grant.kind as "trial" | "package",
    endsAt: grant.endsAt,
    daysLeft: Math.max(0, Math.ceil((grant.endsAt.getTime() - now.getTime()) / DAY_MS)),
    checksLeft: grant.checkLimit === null ? null : grant.checkLimit - grant.checksUsed,
    dailyLimit: grant.dailyCheckLimit,
  };
}

export async function getAccessStatus(
  db: Executor,
  profileId: string,
  now: Date = new Date(),
): Promise<AccessStatus> {
  // Satu query: grant per pengguna jumlahnya kecil, jadi aktif atau tidaknya dihitung di sini.
  const all = await db.select().from(accessGrants).where(eq(accessGrants.userId, profileId));
  return accessStatusFromGrants(all, now);
}

/** Akses selamanya (paket tanpa batas waktu) yang diberikan admin langsung, tanpa kode. */
export async function grantLifetime(
  db: Db,
  actorId: string,
  userId: string,
  now: Date = new Date(),
): Promise<AccessGrant> {
  const cfg = await getAppSettings(db);
  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) throw new NotFound("Pengguna tidak ditemukan.");
    const [grant] = await tx
      .insert(accessGrants)
      .values({
        userId,
        accessCodeId: null,
        kind: "package",
        startsAt: now,
        endsAt: addDays(now, NO_EXPIRY_DAYS),
        checkLimit: null,
        dailyCheckLimit: cfg["package.daily_check_limit"],
      })
      .returning();
    await writeAudit(tx, actorId, "grant.lifetime", "access_grants", grant!.id, {
      user_id: userId,
    });
    return grant!;
  });
}

/** Trial N hari yang diberikan admin langsung. Batas cek mengikuti pengaturan trial. */
export async function grantTrial(
  db: Db,
  actorId: string,
  userId: string,
  days: number,
  now: Date = new Date(),
): Promise<AccessGrant> {
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new AppError("Jumlah hari trial antara 1 sampai 365.");
  }
  const cfg = await getAppSettings(db);
  return db.transaction(async (tx) => {
    const [profile] = await tx.select().from(profiles).where(eq(profiles.id, userId)).for("update");
    if (!profile) throw new NotFound("Pengguna tidak ditemukan.");
    const [grant] = await tx
      .insert(accessGrants)
      .values({
        userId,
        accessCodeId: null,
        kind: "trial",
        startsAt: now,
        endsAt: addDays(now, days),
        checkLimit: cfg["trial.check_limit"],
        dailyCheckLimit: cfg["trial.daily_check_limit"],
      })
      .returning();
    await tx.update(profiles).set({ trialUsed: true }).where(eq(profiles.id, userId));
    await writeAudit(tx, actorId, "grant.trial", "access_grants", grant!.id, {
      user_id: userId,
      days,
    });
    return grant!;
  });
}
