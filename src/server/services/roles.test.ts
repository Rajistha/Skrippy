import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthUser, createTestDb, type TestDb } from "@tests/helpers/test-db";
import { schema } from "../db";
import * as admin from "./admin";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

async function profile(email: string, role: "user" | "superadmin" = "user") {
  const id = randomUUID();
  await createAuthUser(t.raw, id, email);
  await t.db.insert(schema.profiles).values({ id, email, role, trialUsed: true });
  return id;
}
const roleOf = async (id: string) =>
  (await t.db.select().from(schema.profiles).where(eq(schema.profiles.id, id)))[0]!.role;

describe("mengubah peran akun", () => {
  it("admin menjadikan pengguna admin dan sebaliknya, tercatat di log audit", async () => {
    const actor = await profile("admin1@example.com", "superadmin");
    const target = await profile("target1@example.com");
    await admin.setUserRole(t.db, actor, target, "superadmin");
    expect(await roleOf(target)).toBe("superadmin");
    await admin.setUserRole(t.db, actor, target, "user");
    expect(await roleOf(target)).toBe("user");
    const logs = await t.db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.targetId, target));
    expect(logs.map((l) => l.action)).toEqual(["user.role_change", "user.role_change"]);
    expect(logs[0]!.metadata).toEqual({ from: "user", to: "superadmin" });
  });

  it("menetapkan peran yang sama tidak mengubah apa pun dan tidak mencatat log", async () => {
    const actor = await profile("admin2@example.com", "superadmin");
    const target = await profile("target2@example.com");
    await admin.setUserRole(t.db, actor, target, "user");
    expect(
      await t.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.targetId, target)),
    ).toHaveLength(0);
  });

  it("tidak bisa mengubah akun sendiri", async () => {
    const actor = await profile("admin3@example.com", "superadmin");
    await expect(admin.setUserRole(t.db, actor, actor, "user")).rejects.toMatchObject({
      code: "role_self",
    });
    expect(await roleOf(actor)).toBe("superadmin");
  });

  it("akun pemilik (SUPERADMIN_EMAIL) tidak bisa diubah, tanpa peduli huruf besar atau spasi", async () => {
    const actor = await profile("admin4@example.com", "superadmin");
    const owner = await profile("owner@example.com", "superadmin");
    await expect(admin.setUserRole(t.db, actor, owner, "user")).rejects.toMatchObject({
      code: "role_owner",
    });
    expect(admin.isOwnerEmail("  OWNER@Example.com ")).toBe(true);
    expect(admin.isOwnerEmail("lain@example.com")).toBe(false);
  });

  it("harus tersisa minimal satu admin", async () => {
    const lone = await profile("satu-satunya@example.com", "superadmin");
    // Bersihkan admin lain agar hanya satu yang tersisa.
    await t.db
      .update(schema.profiles)
      .set({ role: "user" })
      .where(eq(schema.profiles.role, "superadmin"));
    await t.db
      .update(schema.profiles)
      .set({ role: "superadmin" })
      .where(eq(schema.profiles.id, lone));
    const actor = await profile("pelaku-biasa@example.com");
    await expect(admin.setUserRole(t.db, actor, lone, "user")).rejects.toMatchObject({
      code: "role_last_admin",
    });
    expect(await roleOf(lone)).toBe("superadmin");
  });

  it("pengguna tidak ditemukan", async () => {
    const actor = await profile("admin5@example.com", "superadmin");
    await expect(admin.setUserRole(t.db, actor, randomUUID(), "user")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("daftar pengguna menandai akun pemilik", async () => {
    await profile("owner@example.com");
    const rows = await admin.listUsers(t.db);
    expect(rows.find((r) => r.email === "owner@example.com")?.isOwner).toBe(true);
    expect(rows.find((r) => r.email === "target1@example.com")?.isOwner).toBe(false);
  });

  it("daftar pengguna menghitung penyimpanan dari naskah terkonfirmasi yang belum dihapus", async () => {
    const owner = await profile("storage1@example.com");
    const other = await profile("storage2@example.com");
    const [g] = await t.db.select().from(schema.guidelines).limit(1);
    const [thesis] = await t.db
      .insert(schema.theses)
      .values({ ownerId: owner, guidelineId: g!.id, title: "T" })
      .returning();
    const doc = (
      versionNo: number,
      sizeBytes: number,
      over: Partial<typeof schema.documents.$inferInsert>,
    ) =>
      t.db.insert(schema.documents).values({
        thesisId: thesis!.id,
        versionNo,
        originalFilename: `v${versionNo}.docx`,
        storageKey: randomUUID(),
        mimeType: "x",
        sizeBytes,
        sha256: "a".repeat(64),
        ...over,
      });
    await doc(1, 1000, {});
    await doc(2, 2500, {});
    await doc(3, 9999, { deletedAt: new Date() }); // sudah dihapus
    await doc(4, 7777, { sha256: null }); // unggahan belum dikonfirmasi
    const rows = await admin.listUsers(t.db);
    const mine = rows.find((r) => r.id === owner)!;
    expect([mine.storageBytes, mine.fileCount]).toEqual([3500, 2]);
    const none = rows.find((r) => r.id === other)!;
    expect([none.storageBytes, none.fileCount]).toEqual([0, 0]);
  });
});
