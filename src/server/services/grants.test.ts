import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthUser, createTestDb, type TestDb } from "@tests/helpers/test-db";
import { schema } from "../db";
import * as access from "./access";

const NOW = new Date("2026-10-20T03:00:00Z");
const DAY = 86_400_000;

let t: TestDb;
let adminId: string;
beforeAll(async () => {
  t = await createTestDb();
  adminId = randomUUID();
  await createAuthUser(t.raw, adminId, "admin@example.com");
});
afterAll(async () => {
  await t.close();
});

async function newProfile() {
  const id = randomUUID();
  await createAuthUser(t.raw, id, `${id.slice(0, 6)}@example.com`);
  await t.db.insert(schema.profiles).values({ id, email: `${id.slice(0, 6)}@example.com` });
  return id;
}
const grantsOf = (id: string) =>
  t.db.select().from(schema.accessGrants).where(eq(schema.accessGrants.userId, id));

describe("admin memberi akses langsung", () => {
  it("selamanya: paket tanpa batas jumlah cek dan hampir tanpa batas waktu, dengan batas harian paket", async () => {
    const id = await newProfile();
    const grant = await access.grantLifetime(t.db, adminId, id, NOW);
    expect(grant).toMatchObject({
      kind: "package",
      accessCodeId: null,
      checkLimit: null,
      dailyCheckLimit: 20,
    });
    expect(grant.endsAt.getTime() - NOW.getTime()).toBeGreaterThan(50 * 365 * DAY);
    const status = access.accessStatusFromGrants(await grantsOf(id), NOW);
    expect(status).toMatchObject({ state: "package", checksLeft: null });
    expect(status.daysLeft).toBeGreaterThan(3650);
  });

  it("trial N hari: batas cek mengikuti pengaturan trial dan trial_used menjadi true", async () => {
    const id = await newProfile();
    const grant = await access.grantTrial(t.db, adminId, id, 10, NOW);
    expect(grant).toMatchObject({ kind: "trial", checkLimit: 3, dailyCheckLimit: 3 });
    expect(grant.endsAt.getTime() - NOW.getTime()).toBe(10 * DAY);
    const [p] = await t.db.select().from(schema.profiles).where(eq(schema.profiles.id, id));
    expect(p!.trialUsed).toBe(true);
    expect(access.accessStatusFromGrants(await grantsOf(id), NOW)).toMatchObject({
      state: "trial",
      checksLeft: 3,
    });
  });

  it("jumlah hari trial dibatasi 1 sampai 365", async () => {
    const id = await newProfile();
    for (const days of [0, -1, 366, 1.5]) {
      await expect(access.grantTrial(t.db, adminId, id, days, NOW)).rejects.toThrow(/1 sampai 365/);
    }
    expect(await grantsOf(id)).toHaveLength(0);
  });

  it("pengguna tidak dikenal: 404, dan keduanya tercatat di log audit", async () => {
    await expect(access.grantLifetime(t.db, adminId, randomUUID(), NOW)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(access.grantTrial(t.db, adminId, randomUUID(), 5, NOW)).rejects.toMatchObject({
      code: "not_found",
    });
    const id = await newProfile();
    await access.grantLifetime(t.db, adminId, id, NOW);
    await access.grantTrial(t.db, adminId, id, 5, NOW);
    const actions = (await t.db.select().from(schema.auditLogs)).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["grant.lifetime", "grant.trial"]));
  });

  it("paket dipilih di atas trial, dan mencabut akses mematikan keduanya", async () => {
    const id = await newProfile();
    await access.grantTrial(t.db, adminId, id, 5, NOW);
    await access.grantLifetime(t.db, adminId, id, NOW);
    expect(access.accessStatusFromGrants(await grantsOf(id), NOW).state).toBe("package");
    await access.stopAccess(t.db, adminId, id, { reason: "Dicabut oleh admin" }, NOW);
    expect(access.accessStatusFromGrants(await grantsOf(id), NOW).state).toBe("expired");
  });
});

describe("accessStatusFromGrants", () => {
  it("tanpa grant: none; semua dicabut atau lewat: expired", () => {
    expect(access.accessStatusFromGrants([], NOW).state).toBe("none");
  });
});

describe("batas cek mengikuti Pengaturan", () => {
  it("mengubah batas harian paket langsung berlaku ke akses aktif, kecuali admin dan akses yang sudah berakhir", async () => {
    const active = await newProfile();
    const admin = await newProfile();
    await t.db
      .update(schema.profiles)
      .set({ role: "superadmin" })
      .where(eq(schema.profiles.id, admin));
    const expired = await newProfile();
    await access.grantLifetime(t.db, adminId, active, NOW);
    await access.grantLifetime(t.db, adminId, admin, NOW);
    await t.db.insert(schema.accessGrants).values({
      userId: expired,
      kind: "package",
      startsAt: new Date("2020-01-01"),
      endsAt: new Date("2020-02-01"),
      checkLimit: null,
      dailyCheckLimit: 20,
    });

    await access.updateSettings(t.db, adminId, { "package.daily_check_limit": 7 });

    expect((await grantsOf(active))[0]!.dailyCheckLimit).toBe(7);
    expect((await grantsOf(admin))[0]!.dailyCheckLimit).toBe(20);
    expect((await grantsOf(expired))[0]!.dailyCheckLimit).toBe(20);
    await access.updateSettings(t.db, adminId, { "package.daily_check_limit": 20 });
  });

  it("jatah trial yang diubah ikut berlaku ke trial yang sedang berjalan", async () => {
    const id = await newProfile();
    await access.grantTrial(t.db, adminId, id, 10, NOW);
    await access.updateSettings(t.db, adminId, {
      "trial.check_limit": 5,
      "trial.daily_check_limit": 4,
    });
    expect((await grantsOf(id))[0]).toMatchObject({ checkLimit: 5, dailyCheckLimit: 4 });
    await access.updateSettings(t.db, adminId, {
      "trial.check_limit": 3,
      "trial.daily_check_limit": 3,
    });
  });
});
