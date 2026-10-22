import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { badFormatDocx } from "@tests/fixtures/build-fixtures";
import { FakeStorage } from "@tests/helpers/fakes";
import { createAuthUser, createTestDb, type TestDb } from "@tests/helpers/test-db";
import { schema } from "../db";
import { AppError, NotFound } from "../errors";
import * as access from "./access";
import * as checks from "./checks";
import * as sharing from "./sharing";
import * as theses from "./theses";

const NOW = new Date("2026-10-20T03:00:00Z");
const DAY = 86_400_000;

let t: TestDb;
let storage: FakeStorage;
let guidelineId: string;

beforeAll(async () => {
  t = await createTestDb();
  const [g] = await t.db.select().from(schema.guidelines);
  guidelineId = g!.id;
});
afterAll(async () => {
  await t.close();
});

async function completedRun() {
  storage = new FakeStorage();
  const adminId = randomUUID();
  await createAuthUser(t.raw, adminId, "admin@example.com");
  const userId = randomUUID();
  const email = `${userId.slice(0, 6)}@example.com`;
  await createAuthUser(t.raw, userId, email);
  const [code] = await access.createCodes(
    t.db,
    adminId,
    { kind: "package", paymentNote: "lunas" },
    NOW,
  );
  await access.redeemCode(t.db, { userId, email }, code!.plain, NOW);
  const [profile] = await t.db.select().from(schema.profiles).where(eq(schema.profiles.id, userId));
  const created = await theses.createThesis(t.db, profile!, {
    title: "Skripsi Dibagikan",
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
  storage.upload(uploadUrl, await badFormatDocx());
  const doc = await theses.confirmUpload(t.db, thesis, document, storage);
  const queued = await checks.createCheckRun(t.db, profile!, thesis, doc, ["format"], NOW);
  const run = await checks.executeCheckRun(t.db, storage, queued.id, () => undefined);
  return { profile: profile!, run, queued };
}

describe("tautan berbagi", () => {
  it("token acak, hanya hash yang disimpan, berlaku 14 hari", async () => {
    const { profile, run } = await completedRun();
    const { link, token } = await sharing.createShareLink(t.db, profile.id, run, NOW);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Date(link.expires_at).getTime() - NOW.getTime()).toBe(14 * DAY);
    const rows = await t.db
      .select()
      .from(schema.shareLinks)
      .where(eq(schema.shareLinks.id, link.id));
    expect(rows[0]!.tokenHash).toBe(sharing.hashToken(token));
    expect(JSON.stringify(rows[0])).not.toContain(token);
    expect(await sharing.listActiveLinks(t.db, run, NOW)).toHaveLength(1);
  });

  it("pembaca tautan melihat laporan tanpa data pemilik", async () => {
    const { profile, run } = await completedRun();
    const { token } = await sharing.createShareLink(t.db, profile.id, run, NOW);
    const report = await sharing.getSharedReport(t.db, token, new Date(NOW.getTime() + DAY));
    expect(report.thesis_title).toBe("Skripsi Dibagikan");
    expect(report.issues.length).toBe(run.issueCount);
    expect(report.issues.every((i) => i.user_status === "open")).toBe(true);
    const text = JSON.stringify(report);
    expect(text).not.toContain(profile.email);
    expect(text).not.toContain(profile.id);
  });

  it("temuan yang ditandai bukan masalah oleh pemilik tidak ikut terbagi", async () => {
    const { profile, run } = await completedRun();
    const [first] = await checks.listIssues(t.db, run);
    await checks.setIssueStatus(t.db, run, first!.id, "false_positive");
    const { token } = await sharing.createShareLink(t.db, profile.id, run, NOW);
    const report = await sharing.getSharedReport(t.db, token, NOW);
    expect(report.issues.map((i) => i.id)).not.toContain(first!.id);
  });

  it("token salah, kedaluwarsa, atau dicabut: respons sama (tidak ditemukan)", async () => {
    const { profile, run } = await completedRun();
    const { link, token } = await sharing.createShareLink(t.db, profile.id, run, NOW);
    await expect(sharing.getSharedReport(t.db, "x".repeat(43), NOW)).rejects.toBeInstanceOf(
      NotFound,
    );
    await expect(
      sharing.getSharedReport(t.db, token, new Date(NOW.getTime() + 14 * DAY + 1)),
    ).rejects.toBeInstanceOf(NotFound);
    await sharing.revokeShareLink(t.db, profile.id, run, link.id, NOW);
    await expect(sharing.getSharedReport(t.db, token, NOW)).rejects.toBeInstanceOf(NotFound);
    expect(await sharing.listActiveLinks(t.db, run, NOW)).toHaveLength(0);
    await expect(
      sharing.revokeShareLink(t.db, profile.id, run, link.id, NOW),
    ).rejects.toBeInstanceOf(NotFound);
  });

  it("mencabut tautan milik laporan lain ditolak", async () => {
    const a = await completedRun();
    const b = await completedRun();
    const { link } = await sharing.createShareLink(t.db, a.profile.id, a.run, NOW);
    await expect(
      sharing.revokeShareLink(t.db, b.profile.id, b.run, link.id, NOW),
    ).rejects.toBeInstanceOf(NotFound);
  });

  it("laporan belum selesai tidak bisa dibagikan, dan batas lima tautan aktif", async () => {
    const { profile, run, queued } = await completedRun();
    await expect(
      sharing.createShareLink(t.db, profile.id, { id: queued.id, status: "processing" }, NOW),
    ).rejects.toMatchObject({
      code: "run_not_ready",
    });
    for (let i = 0; i < 5; i++) await sharing.createShareLink(t.db, profile.id, run, NOW);
    await expect(sharing.createShareLink(t.db, profile.id, run, NOW)).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(sharing.createShareLink(t.db, profile.id, run, NOW)).rejects.toMatchObject({
      code: "share_limit",
    });
  });

  it("tautan kedaluwarsa tidak dihitung ke batas aktif", async () => {
    const { profile, run } = await completedRun();
    for (let i = 0; i < 5; i++) await sharing.createShareLink(t.db, profile.id, run, NOW);
    const later = new Date(NOW.getTime() + 15 * DAY);
    await expect(sharing.createShareLink(t.db, profile.id, run, later)).resolves.toBeDefined();
  });
});
