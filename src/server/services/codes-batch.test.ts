import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthUser, createTestDb, type TestDb } from "@tests/helpers/test-db";
import { schema } from "../db";
import { AppError, InvalidAccessCode } from "../errors";
import * as access from "./access";
import * as admin from "./admin";
import * as batches from "./batches";

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

async function user() {
  const userId = randomUUID();
  const email = `${userId.slice(0, 6)}@example.com`;
  await createAuthUser(t.raw, userId, email);
  return { userId, email };
}

describe("batch kode", () => {
  it("membuat ratusan kode unik sekaligus dengan satu catatan audit", async () => {
    const before = (await t.db.select().from(schema.auditLogs)).length;
    const started = Date.now();
    const created = await access.createCodes(
      t.db,
      adminId,
      { kind: "package", count: 300, recipientNote: "Angkatan 2022" },
      NOW,
    );
    expect(created).toHaveLength(300);
    expect(new Set(created.map((c) => c.plain)).size).toBe(300);
    expect(created.every((c) => c.record.recipientNote === "Angkatan 2022")).toBe(true);
    expect(Date.now() - started).toBeLessThan(15_000);
    const logs = (await t.db.select().from(schema.auditLogs)).slice(before);
    expect(logs.filter((l) => l.action === "code.create")).toHaveLength(1);
    expect(logs.find((l) => l.action === "code.create")!.metadata).toMatchObject({
      count: 300,
      kind: "package",
    });
  });

  it("batas jumlah kode dan kuota pakai", async () => {
    await expect(
      access.createCodes(t.db, adminId, { kind: "package", count: 501 }, NOW),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      access.createCodes(t.db, adminId, { kind: "package", count: 0 }, NOW),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      access.createCodes(t.db, adminId, { kind: "package", maxRedemptions: 1001 }, NOW),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      access.createCodes(t.db, adminId, { kind: "package", maxRedemptions: 0 }, NOW),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("kuota pakai per kode", () => {
  it("kode berkuota 3 dipakai tiga orang berbeda; orang keempat ditolak dan statusnya 'dipakai'", async () => {
    const [code] = await access.createCodes(
      t.db,
      adminId,
      { kind: "package", maxRedemptions: 3 },
      NOW,
    );
    for (let i = 0; i < 3; i++) await access.redeemCode(t.db, await user(), code!.plain, NOW);
    await expect(access.redeemCode(t.db, await user(), code!.plain, NOW)).rejects.toBeInstanceOf(
      InvalidAccessCode,
    );
    const [row] = await t.db
      .select()
      .from(schema.accessCodes)
      .where(eq(schema.accessCodes.id, code!.record.id));
    expect(row).toMatchObject({ redemptionCount: 3, maxRedemptions: 3 });
    expect(admin.codeStatus(row!, NOW)).toBe("used");
  });

  it("orang yang sama tidak bisa memakai kode yang sama dua kali (kuota tidak habis, masa aktif tidak menumpuk)", async () => {
    const [code] = await access.createCodes(
      t.db,
      adminId,
      { kind: "package", maxRedemptions: 5 },
      NOW,
    );
    const me = await user();
    await access.redeemCode(t.db, me, code!.plain, NOW);
    await expect(access.redeemCode(t.db, me, code!.plain, NOW)).rejects.toBeInstanceOf(
      InvalidAccessCode,
    );
    const [row] = await t.db
      .select()
      .from(schema.accessCodes)
      .where(eq(schema.accessCodes.id, code!.record.id));
    expect(row!.redemptionCount).toBe(1);
    expect(
      await t.db
        .select()
        .from(schema.accessGrants)
        .where(eq(schema.accessGrants.userId, me.userId)),
    ).toHaveLength(1);
  });

  it("penukaran serentak pada kode berkuota 2 oleh 5 orang: tepat dua yang berhasil", async () => {
    const [code] = await access.createCodes(
      t.db,
      adminId,
      { kind: "package", maxRedemptions: 2 },
      NOW,
    );
    const people = await Promise.all(Array.from({ length: 5 }, () => user()));
    const results = await Promise.allSettled(
      people.map((p) => access.redeemCode(t.db, p, code!.plain, NOW)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
  });
});

describe("berlaku sampai", () => {
  it("kosong berarti tanpa batas: masih bisa ditukar bertahun-tahun kemudian", async () => {
    const [code] = await access.createCodes(t.db, adminId, { kind: "package" }, NOW);
    const later = new Date(NOW.getTime() + 5 * 365 * DAY);
    await expect(access.redeemCode(t.db, await user(), code!.plain, later)).resolves.toBeDefined();
  });

  it("dengan tanggal: bisa ditukar sampai batas, lalu ditolak", async () => {
    const validUntil = new Date("2026-10-25T16:59:59.999Z"); // akhir 25 Oktober WIB
    const [code] = await access.createCodes(t.db, adminId, { kind: "package", validUntil }, NOW);
    await expect(
      access.redeemCode(t.db, await user(), code!.plain, new Date("2026-10-25T16:00:00Z")),
    ).resolves.toBeDefined();
    await expect(
      access.redeemCode(t.db, await user(), code!.plain, new Date("2026-10-25T17:00:00Z")),
    ).rejects.toBeInstanceOf(InvalidAccessCode);
  });

  it("tanggal di masa lalu ditolak saat membuat kode", async () => {
    await expect(
      access.createCodes(
        t.db,
        adminId,
        { kind: "package", validUntil: new Date(NOW.getTime() - DAY) },
        NOW,
      ),
    ).rejects.toThrow(/masa depan/);
  });
});

describe("lihat kode lagi", () => {
  it("kode asli tampil di daftar, di database hanya terenkripsi, dan tetap bisa ditukar", async () => {
    const [code] = await access.createCodes(
      t.db,
      adminId,
      { kind: "package", recipientNote: "Rina" },
      NOW,
    );
    const [row] = await t.db
      .select()
      .from(schema.accessCodes)
      .where(eq(schema.accessCodes.id, code!.record.id));
    expect(row!.codeEncrypted).toBeTruthy();
    expect(row!.codeEncrypted).not.toContain(code!.plain);
    expect(JSON.stringify(row)).not.toContain(code!.plain);

    const listed = (await batches.getBatch(t.db, code!.record.batchId!, NOW)).codes.find(
      (r) => r.id === code!.record.id,
    );
    expect(listed?.code).toBe(code!.plain);
    await expect(access.redeemCode(t.db, await user(), listed!.code!, NOW)).resolves.toBeDefined();
  });

  it("kode lama (tanpa salinan terenkripsi) tampil tanpa kode asli, dan rahasia server yang berganti tidak membuat daftar gagal", async () => {
    const [code] = await access.createCodes(t.db, adminId, { kind: "package" }, NOW);
    await t.db
      .update(schema.accessCodes)
      .set({ codeEncrypted: null })
      .where(eq(schema.accessCodes.id, code!.record.id));
    const [broken] = await access.createCodes(t.db, adminId, { kind: "package" }, NOW);
    await t.db
      .update(schema.accessCodes)
      .set({ codeEncrypted: "bukan-ciphertext-valid" })
      .where(eq(schema.accessCodes.id, broken!.record.id));
    const first = (await batches.getBatch(t.db, code!.record.batchId!, NOW)).codes;
    const second = (await batches.getBatch(t.db, broken!.record.batchId!, NOW)).codes;
    expect(first.find((r) => r.id === code!.record.id)?.code).toBeNull();
    expect(second.find((r) => r.id === broken!.record.id)?.code).toBeNull();
  });
});

describe("hapus kode", () => {
  const grantsOf = (userId: string) =>
    t.db.select().from(schema.accessGrants).where(eq(schema.accessGrants.userId, userId));

  it("kode belum dipakai: terhapus dan tidak bisa ditukar lagi", async () => {
    const [code] = await access.createCodes(t.db, adminId, { kind: "package" }, NOW);
    const res = await access.deleteCode(t.db, adminId, code!.record.id, NOW);
    expect(res.usersAffected).toBe(0);
    expect(
      await t.db
        .select()
        .from(schema.accessCodes)
        .where(eq(schema.accessCodes.id, code!.record.id)),
    ).toHaveLength(0);
    await expect(access.redeemCode(t.db, await user(), code!.plain, NOW)).rejects.toBeInstanceOf(
      InvalidAccessCode,
    );
  });

  it("kode sudah dipakai: akses yang berasal darinya ikut hilang, riwayat cek tetap ada", async () => {
    const [code] = await access.createCodes(
      t.db,
      adminId,
      { kind: "package", maxRedemptions: 2 },
      NOW,
    );
    const a = await user();
    const b = await user();
    await access.redeemCode(t.db, a, code!.plain, NOW);
    await access.redeemCode(t.db, b, code!.plain, NOW);
    expect(await access.getAccessStatus(t.db, a.userId, NOW)).toMatchObject({ state: "package" });

    // Satu pengguna sudah punya cek yang memakai akses itu.
    const [grant] = await grantsOf(a.userId);
    const [g] = await t.db.select().from(schema.guidelines);
    await t.db
      .insert(schema.theses)
      .values({ id: randomUUID(), ownerId: a.userId, guidelineId: g!.id, title: "T" });
    const [thesis] = await t.db
      .select()
      .from(schema.theses)
      .where(eq(schema.theses.ownerId, a.userId));
    const docId = randomUUID();
    await t.db.insert(schema.documents).values({
      id: docId,
      thesisId: thesis!.id,
      versionNo: 1,
      originalFilename: "n.docx",
      storageKey: "k",
      mimeType: "x",
      sizeBytes: 1,
      sha256: "a".repeat(64),
    });
    const runId = randomUUID();
    await t.db.insert(schema.checkRuns).values({
      id: runId,
      documentId: docId,
      requestedBy: a.userId,
      accessGrantId: grant!.id,
      guidelineSnapshot: {},
      checkTypes: ["format"],
      status: "completed",
    });

    const res = await access.deleteCode(t.db, adminId, code!.record.id, NOW);
    expect(res.usersAffected).toBe(2);
    expect(await access.getAccessStatus(t.db, a.userId, NOW)).toMatchObject({ state: "expired" });
    expect(await access.getAccessStatus(t.db, b.userId, NOW)).toMatchObject({ state: "expired" });
    await expect(access.ensureCanRunCheck(t.db, { id: a.userId } as never, NOW)).rejects.toThrow();
    const [after] = await grantsOf(a.userId);
    expect(after).toMatchObject({ accessCodeId: null, revokeReason: "Kode akses dihapus" });
    expect(after!.revokedAt).not.toBeNull();
    // Riwayat cek tetap ada.
    expect(
      await t.db.select().from(schema.checkRuns).where(eq(schema.checkRuns.id, runId)),
    ).toHaveLength(1);
  });

  it("akses dari kode lain tidak ikut hilang, dan kejadian tercatat di log audit", async () => {
    const [keep] = await access.createCodes(t.db, adminId, { kind: "package" }, NOW);
    const [drop] = await access.createCodes(t.db, adminId, { kind: "package" }, NOW);
    const u = await user();
    await access.redeemCode(t.db, u, drop!.plain, NOW);
    await access.redeemCode(t.db, u, keep!.plain, NOW); // perpanjangan: akses kedua dari kode lain
    await access.deleteCode(t.db, adminId, drop!.record.id, NOW);
    expect(await access.getAccessStatus(t.db, u.userId, NOW)).toMatchObject({ state: "package" });
    const logs = await t.db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.targetId, drop!.record.id));
    expect(logs.find((l) => l.action === "code.delete")?.metadata).toMatchObject({
      redemptions: 1,
      users_affected: 1,
    });
  });

  it("kode tidak dikenal 404", async () => {
    await expect(access.deleteCode(t.db, adminId, randomUUID(), NOW)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
