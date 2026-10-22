import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { goodDocx } from "@tests/fixtures/build-fixtures";
import { FakeAuthAdmin, FakeStorage } from "@tests/helpers/fakes";
import { createAuthUser, createTestDb, type TestDb } from "@tests/helpers/test-db";
import { schema } from "../db";
import * as access from "./access";
import * as admin from "./admin";
import * as checks from "./checks";
import * as theses from "./theses";

const NOW = new Date("2026-10-20T03:00:00Z");

let t: TestDb;
let guidelineId: string;
let actorId: string;
beforeAll(async () => {
  t = await createTestDb();
  const [g] = await t.db.select().from(schema.guidelines);
  guidelineId = g!.id;
  actorId = randomUUID();
  await createAuthUser(t.raw, actorId, "admin@example.com");
  await t.db
    .insert(schema.profiles)
    .values({ id: actorId, email: "admin@example.com", role: "superadmin", trialUsed: true });
});
afterAll(async () => {
  await t.close();
});

/** Pengguna lengkap: akses paket, skripsi, satu versi naskah di storage, dan satu laporan selesai. */
async function fullUser(email: string) {
  const storage = new FakeStorage();
  const authAdmin = new FakeAuthAdmin();
  const userId = randomUUID();
  await createAuthUser(t.raw, userId, email);
  const [code] = await access.createCodes(t.db, actorId, { kind: "package" }, NOW);
  await access.redeemCode(t.db, { userId, email }, code!.plain, NOW);
  const [profile] = await t.db.select().from(schema.profiles).where(eq(schema.profiles.id, userId));
  const created = await theses.createThesis(t.db, profile!, {
    title: "Skripsi Dihapus",
    guidelineId,
  });
  const thesis = await theses.getOwnedThesis(t.db, profile!, created.id);
  const { document, uploadUrl } = await theses.startUpload(
    t.db,
    profile!,
    thesis,
    "n.docx",
    storage,
  );
  storage.upload(uploadUrl, await goodDocx());
  const doc = await theses.confirmUpload(t.db, thesis, document, storage);
  const queued = await checks.createCheckRun(t.db, profile!, thesis, doc, ["format"], NOW);
  await checks.executeCheckRun(t.db, storage, queued.id, () => undefined);
  return { storage, authAdmin, userId, codeId: code!.record.id, storageKey: document.storageKey };
}

describe("admin menghapus akun pengguna", () => {
  it("menghapus semua data, file di storage, dan akun login; kode yang dipakai tetap tercatat tanpa tautan identitas", async () => {
    const u = await fullUser("hapus-aku@example.com");
    expect(u.storage.files.size).toBe(1);
    await admin.deleteUserAccount(
      t.db,
      { storage: u.storage, authAdmin: u.authAdmin },
      actorId,
      u.userId,
    );

    expect(
      await t.db.select().from(schema.profiles).where(eq(schema.profiles.id, u.userId)),
    ).toHaveLength(0);
    expect(
      await t.db.select().from(schema.theses).where(eq(schema.theses.ownerId, u.userId)),
    ).toHaveLength(0);
    expect(
      await t.db.select().from(schema.accessGrants).where(eq(schema.accessGrants.userId, u.userId)),
    ).toHaveLength(0);
    expect(
      await t.db.select().from(schema.checkRuns).where(eq(schema.checkRuns.requestedBy, u.userId)),
    ).toHaveLength(0);
    expect(u.storage.files.size).toBe(0); // file naskah ikut dihapus
    expect(u.authAdmin.deleted).toEqual([u.userId]);

    const [code] = await t.db
      .select()
      .from(schema.accessCodes)
      .where(eq(schema.accessCodes.id, u.codeId));
    expect(code).toMatchObject({ redemptionCount: 1, kind: "package" }); // catatan pembayaran tetap
    const logs = await t.db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.targetId, u.userId));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: "user.delete",
      actorId,
      metadata: { email: "hapus-aku@example.com" },
    });
  });

  it("tidak mempengaruhi pengguna lain", async () => {
    const a = await fullUser("a-hapus@example.com");
    const b = await fullUser("b-tetap@example.com");
    await admin.deleteUserAccount(
      t.db,
      { storage: a.storage, authAdmin: a.authAdmin },
      actorId,
      a.userId,
    );
    expect(
      await t.db.select().from(schema.profiles).where(eq(schema.profiles.id, b.userId)),
    ).toHaveLength(1);
    expect(
      await t.db.select().from(schema.theses).where(eq(schema.theses.ownerId, b.userId)),
    ).toHaveLength(1);
    expect(b.storage.files.size).toBe(1);
    expect(b.authAdmin.deleted).toEqual([]);
  });

  it("pengaman: akun sendiri dan pemilik tidak bisa dihapus; pengguna tak dikenal 404", async () => {
    const deps = { storage: new FakeStorage(), authAdmin: new FakeAuthAdmin() };
    await expect(admin.deleteUserAccount(t.db, deps, actorId, actorId)).rejects.toMatchObject({
      code: "delete_self",
    });

    const ownerId = randomUUID();
    await createAuthUser(t.raw, ownerId, "owner@example.com");
    await t.db
      .insert(schema.profiles)
      .values({ id: ownerId, email: "owner@example.com", role: "superadmin", trialUsed: true });
    await expect(admin.deleteUserAccount(t.db, deps, actorId, ownerId)).rejects.toMatchObject({
      code: "delete_owner",
    });

    await expect(admin.deleteUserAccount(t.db, deps, actorId, randomUUID())).rejects.toMatchObject({
      code: "not_found",
    });
    expect(deps.authAdmin.deleted).toEqual([]); // tidak ada akun login yang terhapus
    for (const id of [actorId, ownerId]) {
      expect(
        await t.db.select().from(schema.profiles).where(eq(schema.profiles.id, id)),
      ).toHaveLength(1);
    }
  });

  it("admin lain boleh dihapus (bukan diri sendiri atau pemilik)", async () => {
    const deps = { storage: new FakeStorage(), authAdmin: new FakeAuthAdmin() };
    const id = randomUUID();
    await createAuthUser(t.raw, id, "admin-lain@example.com");
    await t.db
      .insert(schema.profiles)
      .values({ id, email: "admin-lain@example.com", role: "superadmin", trialUsed: true });
    await admin.deleteUserAccount(t.db, deps, actorId, id);
    expect(
      await t.db.select().from(schema.profiles).where(eq(schema.profiles.id, id)),
    ).toHaveLength(0);
    expect(deps.authAdmin.deleted).toEqual([id]);
  });
});
