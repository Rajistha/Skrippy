import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthUser, createTestDb, type TestDb } from "@tests/helpers/test-db";
import { schema } from "../db";
import {
  AppError,
  CheckNotAllowed,
  InvalidAccessCode,
  RateLimited,
  TrialAlreadyUsed,
} from "../errors";
import * as access from "./access";

const NOW = new Date("2026-10-20T03:00:00Z"); // 10.00 WIB
const DAY = 86_400_000;

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

async function newUser(email = "rina@example.com"): Promise<access.TokenClaims> {
  const userId = randomUUID();
  await createAuthUser(t.raw, userId, email);
  return { userId, email, fullName: "Rina" };
}

async function admin(): Promise<string> {
  return (await newUser("admin@example.com")).userId;
}

async function code(
  kind: "trial" | "package" = "trial",
  extra: Partial<access.CreateCodesInput> = {},
) {
  const actor = await admin();
  const [created] = await access.createCodes(
    t.db,
    actor,
    { kind, ...(kind === "package" ? { paymentNote: "lunas" } : {}), ...extra },
    NOW,
  );
  return created!;
}

async function profileOf(id: string) {
  const [p] = await t.db.select().from(schema.profiles).where(eq(schema.profiles.id, id));
  return p!;
}

/** Buat check_run langsung (tanpa checker) untuk menguji batas harian. */
async function makeRun(userId: string, grantId: string, at: Date) {
  const [g] = await t.db.select().from(schema.guidelines).limit(1);
  const [thesis] = await t.db
    .insert(schema.theses)
    .values({ ownerId: userId, guidelineId: g!.id, title: "t" })
    .returning();
  const [doc] = await t.db
    .insert(schema.documents)
    .values({
      thesisId: thesis!.id,
      versionNo: 1,
      originalFilename: "a.docx",
      storageKey: randomUUID(),
      mimeType: "x",
      sizeBytes: 1,
    })
    .returning();
  return t.db.transaction(async (tx) => {
    const [run] = await tx
      .insert(schema.checkRuns)
      .values({
        documentId: doc!.id,
        requestedBy: userId,
        accessGrantId: grantId,
        guidelineSnapshot: {},
        checkTypes: ["format"],
        createdAt: at,
      })
      .returning();
    await access.consumeCheck(tx, grantId);
    return run!;
  });
}

async function runCheck(userId: string, at: Date) {
  const profile = await profileOf(userId);
  const grant = await t.db.transaction((tx) => access.ensureCanRunCheck(tx, profile, at));
  return makeRun(userId, grant.id, at);
}

describe("kode", () => {
  it("format dan alfabet tanpa karakter mirip", () => {
    for (let i = 0; i < 300; i++) {
      const c = access.generateCode();
      expect(c).toMatch(/^SKR-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(c.slice(4)).not.toMatch(/[O01IL]/);
    }
  });

  it.each(["skr-abcd-efgh", " SKR ABCD EFGH ", "abcdefgh", "SKR-ABCD-EFGH"])(
    "normalisasi %j",
    (raw) => {
      expect(access.normalizeCode(raw)).toBe("SKR-ABCD-EFGH");
    },
  );

  it("kode asli tidak pernah disimpan, hanya hash dan 4 karakter terakhir", async () => {
    const c = await code();
    expect(c.record.codeHint).toBe(c.plain.slice(-4));
    expect(c.record.codeHash).toBe(access.hashCode(c.plain.toLowerCase()));
    expect(JSON.stringify(c.record)).not.toContain(c.plain);
  });

  it("kode paket boleh dibuat tanpa catatan pembayaran (opsional)", async () => {
    const [created] = await access.createCodes(t.db, await admin(), { kind: "package" }, NOW);
    expect(created!.record).toMatchObject({ kind: "package", paymentNote: null });
  });

  it("nilai pengaturan disalin ke kode saat dibuat", async () => {
    const actor = await admin();
    const before = await code();
    await access.updateSettings(t.db, actor, { "trial.duration_days": 30 });
    const after = await code();
    expect(before.record.durationDays).toBe(7);
    expect(after.record.durationDays).toBe(30);
    await access.updateSettings(t.db, actor, { "trial.duration_days": 7 });
  });

  it("pengaturan tak dikenal atau salah tipe ditolak", async () => {
    const actor = await admin();
    await expect(access.updateSettings(t.db, actor, { nope: 1 })).rejects.toThrow(/tidak dikenal/);
    await expect(
      access.updateSettings(t.db, actor, { "package.price_idr": "murah" }),
    ).rejects.toThrow(/tidak valid/);
  });
});

describe("penukaran", () => {
  it("kode trial valid membuat profil dan grant", async () => {
    const claims = await newUser();
    const c = await code();
    const grant = await access.redeemCode(t.db, claims, c.plain, NOW);
    expect(grant).toMatchObject({ kind: "trial", checkLimit: 3, checksUsed: 0 });
    expect(grant.endsAt.getTime()).toBe(NOW.getTime() + 7 * DAY);
    expect((await profileOf(claims.userId)).trialUsed).toBe(true);
  });

  it.each(["unknown", "revoked", "expired", "used"])(
    "kode %s memakai pesan yang sama",
    async (kind) => {
      const c = await code();
      let raw = c.plain;
      if (kind === "unknown") raw = "SKR-ZZZZ-ZZZZ";
      if (kind === "revoked") await access.revokeCode(t.db, await admin(), c.record.id, NOW);
      if (kind === "expired") {
        await t.db
          .update(schema.accessCodes)
          .set({ redeemBefore: new Date(NOW.getTime() - 1000) })
          .where(eq(schema.accessCodes.id, c.record.id));
      }
      if (kind === "used") await access.redeemCode(t.db, await newUser("a@example.com"), raw, NOW);
      const err = await access
        .redeemCode(t.db, await newUser("b@example.com"), raw, NOW)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InvalidAccessCode);
      expect((err as AppError).message).toBe("Kode tidak valid atau sudah tidak berlaku.");
    },
  );

  it("penukaran yang gagal tidak membuat profil", async () => {
    const claims = await newUser("baru@example.com");
    await expect(access.redeemCode(t.db, claims, "SKR-ZZZZ-ZZZZ", NOW)).rejects.toBeInstanceOf(
      InvalidAccessCode,
    );
    const rows = await t.db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, claims.userId));
    expect(rows).toHaveLength(0);
  });

  it("trial kedua ditolak dengan penjelasan", async () => {
    const claims = await newUser();
    await access.redeemCode(t.db, claims, (await code()).plain, NOW);
    await expect(access.redeemCode(t.db, claims, (await code()).plain, NOW)).rejects.toBeInstanceOf(
      TrialAlreadyUsed,
    );
  });

  it("paket menaikkan trial yang aktif", async () => {
    const claims = await newUser();
    const trial = await access.redeemCode(t.db, claims, (await code()).plain, NOW);
    const later = new Date(NOW.getTime() + 2 * DAY);
    const pkg = await access.redeemCode(t.db, claims, (await code("package")).plain, later);
    const [oldTrial] = await t.db
      .select()
      .from(schema.accessGrants)
      .where(eq(schema.accessGrants.id, trial.id));
    expect(oldTrial).toMatchObject({ revokeReason: "upgrade" });
    expect(oldTrial!.revokedAt?.getTime()).toBe(later.getTime());
    expect(pkg.kind).toBe("package");
    expect(pkg.endsAt.getTime()).toBe(later.getTime() + 30 * DAY);
    expect(pkg.checkLimit).toBeNull();
  });

  it("perpanjangan menambah ke akhir paket aktif, bukan dari hari ini", async () => {
    const claims = await newUser();
    const first = await access.redeemCode(t.db, claims, (await code("package")).plain, NOW);
    const second = await access.redeemCode(
      t.db,
      claims,
      (await code("package")).plain,
      new Date(NOW.getTime() + 10 * DAY),
    );
    expect(second.endsAt.getTime()).toBe(first.endsAt.getTime() + 30 * DAY);
  });

  it("paket yang sudah berakhir dimulai lagi dari hari ini", async () => {
    const claims = await newUser();
    await access.redeemCode(t.db, claims, (await code("package")).plain, NOW);
    const later = new Date(NOW.getTime() + 60 * DAY);
    const [again] = await access.createCodes(
      t.db,
      await admin(),
      { kind: "package", paymentNote: "x" },
      later,
    );
    const grant = await access.redeemCode(t.db, claims, again!.plain, later);
    expect(grant.endsAt.getTime()).toBe(later.getTime() + 30 * DAY);
  });

  it("kode multi-pakai", async () => {
    const c = await code("trial", { maxRedemptions: 2 });
    await access.redeemCode(t.db, await newUser("a@example.com"), c.plain, NOW);
    await access.redeemCode(t.db, await newUser("b@example.com"), c.plain, NOW);
    await expect(
      access.redeemCode(t.db, await newUser("c@example.com"), c.plain, NOW),
    ).rejects.toBeInstanceOf(InvalidAccessCode);
  });

  it("dua permintaan paralel dengan kode yang sama: hanya satu berhasil", async () => {
    const c = await code();
    const a = await newUser("a@example.com");
    const b = await newUser("b@example.com");
    const results = await Promise.allSettled([
      access.redeemCode(t.db, a, c.plain, NOW),
      access.redeemCode(t.db, b, c.plain, NOW),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const [row] = await t.db
      .select()
      .from(schema.accessCodes)
      .where(eq(schema.accessCodes.id, c.record.id));
    expect(row!.redemptionCount).toBe(1);
  });

  it("dua penukaran paralel dari akun baru yang sama tidak menggandakan profil", async () => {
    const claims = await newUser("kembar@example.com");
    const results = await Promise.allSettled([
      access.redeemCode(t.db, claims, (await code()).plain, NOW),
      access.redeemCode(t.db, claims, (await code()).plain, NOW),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await t.db.select().from(schema.profiles).where(eq(schema.profiles.id, claims.userId)),
    ).toHaveLength(1);
  });
});

describe("rate limit penukaran", () => {
  it("5 percobaan per 15 menit per akun, percobaan gagal tetap tercatat", async () => {
    const claims = await newUser("spam@example.com");
    for (let i = 0; i < 5; i++) {
      await expect(access.redeemCode(t.db, claims, "SKR-ZZZZ-ZZZZ", NOW)).rejects.toBeInstanceOf(
        InvalidAccessCode,
      );
    }
    await expect(access.redeemCode(t.db, claims, "SKR-ZZZZ-ZZZZ", NOW)).rejects.toBeInstanceOf(
      RateLimited,
    );
    // akun lain tidak terpengaruh
    await expect(
      access.redeemCode(t.db, await newUser(), "SKR-ZZZZ-ZZZZ", NOW),
    ).rejects.toBeInstanceOf(InvalidAccessCode);
    // setelah 15 menit boleh lagi
    const later = new Date(NOW.getTime() + 16 * 60_000);
    await expect(access.redeemCode(t.db, claims, "SKR-ZZZZ-ZZZZ", later)).rejects.toBeInstanceOf(
      InvalidAccessCode,
    );
  });
});

describe("batas cek", () => {
  it("trial: 3 cek lalu ditolak", async () => {
    const claims = await newUser();
    const grant = await access.redeemCode(t.db, claims, (await code()).plain, NOW);
    for (let i = 0; i < 3; i++) await runCheck(claims.userId, NOW);
    const [g] = await t.db
      .select()
      .from(schema.accessGrants)
      .where(eq(schema.accessGrants.id, grant.id));
    expect(g!.checksUsed).toBe(3);
    const err = await runCheck(claims.userId, NOW).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CheckNotAllowed);
    expect((err as CheckNotAllowed).code).toBe("check_limit_reached");
  });

  it("batas harian direset pada tengah malam WIB", async () => {
    const actor = await admin();
    await access.updateSettings(t.db, actor, { "package.daily_check_limit": 2 });
    const claims = await newUser();
    await access.redeemCode(t.db, claims, (await code("package")).plain, NOW);
    await runCheck(claims.userId, NOW);
    await runCheck(claims.userId, NOW);
    const err = await runCheck(claims.userId, NOW).catch((e: unknown) => e);
    expect((err as CheckNotAllowed).code).toBe("daily_limit_reached");
    // 17.05 UTC = 00.05 WIB hari berikutnya
    await expect(runCheck(claims.userId, new Date("2026-10-20T17:05:00Z"))).resolves.toBeDefined();
    await access.updateSettings(t.db, actor, { "package.daily_check_limit": 20 });
  });

  it("batas hari WIB", () => {
    const { start, end } = access.wibDayBounds(new Date("2026-10-20T20:00:00Z")); // 03.00 WIB 21 Okt
    expect(start.toISOString()).toBe("2026-10-20T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-21T17:00:00.000Z");
  });

  it("cek gagal karena sistem tidak memakai jatah, dan idempoten", async () => {
    const claims = await newUser();
    const grant = await access.redeemCode(t.db, claims, (await code()).plain, NOW);
    const run = await runCheck(claims.userId, NOW);
    await access.refundCheck(t.db, run.id);
    await access.refundCheck(t.db, run.id);
    const [g] = await t.db
      .select()
      .from(schema.accessGrants)
      .where(eq(schema.accessGrants.id, grant.id));
    expect(g!.checksUsed).toBe(0);
    expect(await access.checksToday(t.db, claims.userId, NOW)).toBe(0);
  });

  it("akses berakhir memblokir cek tapi status tetap terbaca", async () => {
    const claims = await newUser();
    await access.redeemCode(t.db, claims, (await code()).plain, NOW);
    const later = new Date(NOW.getTime() + 8 * DAY);
    const err = await runCheck(claims.userId, later).catch((e: unknown) => e);
    expect((err as CheckNotAllowed).code).toBe("access_expired");
    expect((await access.getAccessStatus(t.db, claims.userId, later)).state).toBe("expired");
  });

  it("status trial: sisa hari dan sisa cek", async () => {
    const claims = await newUser();
    await access.redeemCode(t.db, claims, (await code()).plain, NOW);
    await runCheck(claims.userId, NOW);
    expect(await access.getAccessStatus(t.db, claims.userId, NOW)).toMatchObject({
      state: "trial",
      daysLeft: 7,
      checksLeft: 2,
    });
  });
});

describe("admin", () => {
  it("tindakan admin menulis audit_logs", async () => {
    const actor = await admin();
    const claims = await newUser();
    await access.redeemCode(t.db, claims, (await code()).plain, NOW);
    await access.extendAccess(t.db, actor, claims.userId, { days: 5, reason: "bonus" }, NOW);
    await access.stopAccess(t.db, actor, claims.userId, { reason: "uji" }, NOW);
    const actions = (await t.db.select({ a: schema.auditLogs.action }).from(schema.auditLogs)).map(
      (r) => r.a,
    );
    expect(actions).toEqual(expect.arrayContaining(["code.create", "grant.extend", "grant.stop"]));
  });

  it("perpanjang dan hentikan wajib beralasan", async () => {
    const actor = await admin();
    const claims = await newUser();
    await access.redeemCode(t.db, claims, (await code()).plain, NOW);
    await expect(
      access.extendAccess(t.db, actor, claims.userId, { days: 3, reason: " " }, NOW),
    ).rejects.toThrow(/Alasan wajib/);
    await expect(
      access.stopAccess(t.db, actor, claims.userId, { reason: "" }, NOW),
    ).rejects.toThrow(/Alasan wajib/);
  });

  it("kode yang sudah dipakai tidak bisa dicabut", async () => {
    const c = await code();
    await access.redeemCode(t.db, await newUser(), c.plain, NOW);
    await expect(access.revokeCode(t.db, await admin(), c.record.id, NOW)).rejects.toThrow(
      /sudah dipakai/,
    );
  });

  it("email SUPERADMIN_EMAIL otomatis menjadi superadmin dengan akses panjang", async () => {
    const owner = await newUser("Owner@Example.com");
    const profile = await access.ensureSuperadminProfile(t.db, owner, NOW);
    expect(profile?.role).toBe("superadmin");
    expect(
      await access.ensureSuperadminProfile(t.db, await newUser("lain@example.com"), NOW),
    ).toBeNull();
    expect(
      await t.db.transaction((tx) => access.ensureCanRunCheck(tx, profile!, NOW)),
    ).toBeDefined();
    // idempoten
    expect((await access.ensureSuperadminProfile(t.db, owner, NOW))?.id).toBe(profile!.id);
  });
});

describe("pengaturan bertipe salah dari SQL manual", () => {
  it("nomor WhatsApp berupa angka dibaca sebagai teks, angka berupa teks dibaca sebagai angka", async () => {
    await t.raw.query(
      `INSERT INTO public.app_settings (key, value) VALUES ('contact.whatsapp', '6281246091171'::jsonb), ('trial.duration_days', '"5"'::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
    const s = await access.getAppSettings(t.db);
    expect(s["contact.whatsapp"]).toBe("6281246091171");
    expect(s["trial.duration_days"]).toBe(5);
    await t.raw.query(
      `DELETE FROM public.app_settings WHERE key IN ('contact.whatsapp','trial.duration_days')`,
    );
  });
});

describe("trial otomatis untuk pengguna baru", () => {
  it("profil baru langsung punya satu trial sesuai pengaturan, dan panggilan ulang tidak menambah", async () => {
    const claims = await newUser("otomatis@example.com");
    const profile = await access.ensureUserProfile(t.db, claims, NOW);
    expect(profile.trialUsed).toBe(true);
    const again = await access.ensureUserProfile(t.db, claims, NOW);
    expect(again.id).toBe(profile.id);
    const grants = await t.db
      .select()
      .from(schema.accessGrants)
      .where(eq(schema.accessGrants.userId, claims.userId));
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ kind: "trial", checkLimit: 3, dailyCheckLimit: 3 });
    expect(grants[0]!.endsAt.getTime() - NOW.getTime()).toBe(7 * DAY);
  });

  it("dua permintaan bersamaan hanya membuat satu trial", async () => {
    const claims = await newUser("serentak@example.com");
    await Promise.all([
      access.ensureUserProfile(t.db, claims, NOW),
      access.ensureUserProfile(t.db, claims, NOW),
    ]);
    const grants = await t.db
      .select()
      .from(schema.accessGrants)
      .where(eq(schema.accessGrants.userId, claims.userId));
    expect(grants).toHaveLength(1);
  });

  it("kode paket sesudah trial otomatis menggantikan trial (upgrade)", async () => {
    const claims = await newUser("upgrade@example.com");
    await access.ensureUserProfile(t.db, claims, NOW);
    const adminId = await admin();
    const [created] = await access.createCodes(
      t.db,
      adminId,
      {
        kind: "package",
        count: 1,
        maxRedemptions: 1,
        paymentNote: "lunas",
        paymentMethod: "transfer",
        priceIdr: 25000,
      } as access.CreateCodesInput,
      NOW,
    );
    await access.redeemCode(t.db, claims, created!.plain, NOW);
    const status = await access.getAccessStatus(t.db, claims.userId, NOW);
    expect(status.state).toBe("package");
  });
});

describe("saklar trial", () => {
  const setTrial = (on: boolean) =>
    access.updateSettings(t.db, "00000000-0000-4000-8000-000000000000", {
      "trial.enabled": on ? 1 : 0,
    });
  const grantsOf = (id: string) =>
    t.db.select().from(schema.accessGrants).where(eq(schema.accessGrants.userId, id));

  it("trial menyala: akun baru langsung dapat trial", async () => {
    await setTrial(true);
    const claims = await newUser("nyala@example.com");
    await access.ensureUserProfile(t.db, claims, NOW);
    expect((await grantsOf(claims.userId))[0]).toMatchObject({ kind: "trial" });
  });

  it("trial mati: akun baru masuk tanpa akses, dan status akses 'none'", async () => {
    await setTrial(false);
    const claims = await newUser("mati@example.com");
    const profile = await access.ensureUserProfile(t.db, claims, NOW);
    expect(profile.trialUsed).toBe(false);
    expect(await grantsOf(claims.userId)).toHaveLength(0);
    expect(await access.getAccessStatus(t.db, claims.userId, NOW)).toMatchObject({ state: "none" });
    await expect(access.ensureCanRunCheck(t.db, profile, NOW)).rejects.toThrow();
  });

  it("trial dinyalakan belakangan: pengguna tanpa akses mendapat trial sekali, tidak ganda", async () => {
    await setTrial(false);
    const claims = await newUser("belakangan@example.com");
    await access.ensureUserProfile(t.db, claims, NOW);
    await setTrial(true);
    expect(await access.grantTrialIfEligible(t.db, claims.userId, NOW)).toBe(true);
    expect(await access.grantTrialIfEligible(t.db, claims.userId, NOW)).toBe(false);
    const results = await Promise.all([
      access.grantTrialIfEligible(t.db, claims.userId, NOW),
      access.grantTrialIfEligible(t.db, claims.userId, NOW),
    ]);
    expect(results).toEqual([false, false]);
    expect(await grantsOf(claims.userId)).toHaveLength(1);
  });

  it("pengguna yang sudah punya akses dari kode tidak mendapat trial tambahan", async () => {
    await setTrial(false);
    const claims = await newUser("berkode@example.com");
    await access.ensureUserProfile(t.db, claims, NOW);
    const [paid] = await access.createCodes(t.db, await admin(), { kind: "package" }, NOW);
    await access.redeemCode(t.db, claims, paid!.plain, NOW);
    await setTrial(true);
    expect(await access.grantTrialIfEligible(t.db, claims.userId, NOW)).toBe(false);
    expect((await grantsOf(claims.userId)).map((g) => g.kind)).toEqual(["package"]);
  });

  it("dua permintaan pertama bersamaan saat trial menyala hanya membuat satu trial", async () => {
    await setTrial(true);
    const claims = await newUser("serentak2@example.com");
    await Promise.all([
      access.ensureUserProfile(t.db, claims, NOW),
      access.ensureUserProfile(t.db, claims, NOW),
    ]);
    expect(await grantsOf(claims.userId)).toHaveLength(1);
  });

  it("admin tidak pernah mendapat trial", async () => {
    await setTrial(true);
    const id = await admin();
    await t.db
      .insert(schema.profiles)
      .values({ id, email: "adm-trial@example.com", role: "superadmin" })
      .onConflictDoNothing();
    expect(await access.grantTrialIfEligible(t.db, id, NOW)).toBe(false);
  });
});

describe("saklar paket berbayar", () => {
  const setPackage = (on: boolean) =>
    access.updateSettings(t.db, "00000000-0000-4000-8000-000000000000", {
      "package.enabled": on ? 1 : 0,
    });

  it("dimatikan: admin tetap bisa membuat kode (saklar hanya menyembunyikan tawaran di sisi pengguna)", async () => {
    await setPackage(false);
    expect((await access.getAppSettings(t.db))["package.enabled"]).toBe(0);
    await expect(
      access.createCodes(t.db, await admin(), { kind: "package" }, NOW),
    ).resolves.toHaveLength(1);
    await setPackage(true);
  });

  it("kode yang dibagikan tetap bisa ditukar walau paket dimatikan", async () => {
    await setPackage(true);
    const [paid] = await access.createCodes(t.db, await admin(), { kind: "package" }, NOW);
    await setPackage(false);
    const grant = await access.redeemCode(
      t.db,
      await newUser("pembeli-lama@example.com"),
      paid!.plain,
      NOW,
    );
    expect(grant.kind).toBe("package");
    await setPackage(true);
    await expect(
      access.createCodes(t.db, await admin(), { kind: "package" }, NOW),
    ).resolves.toHaveLength(1);
  });
});
