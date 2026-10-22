import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeStorage } from "@tests/helpers/fakes";
import { createAuthUser, createTestDb, type TestDb } from "@tests/helpers/test-db";
import { schema } from "../db";
import { cleanOrphans, findOrphans } from "./orphans";

const NOW = new Date("2026-10-20T12:00:00Z");
const OLD = new Date("2026-10-01T00:00:00Z");
const FRESH = new Date("2026-10-20T11:50:00Z");

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

function put(storage: FakeStorage, key: string, at: Date) {
  storage.files.set(key, new Uint8Array(10));
  storage.modified.set(key, at);
}

describe("file yatim di storage", () => {
  it("hanya file tanpa rujukan yang lewat tenggang yang dihitung", async () => {
    const userId = randomUUID();
    await createAuthUser(t.raw, userId, "yatim@example.com");
    const [profile] = await t.db
      .insert(schema.profiles)
      .values({ id: userId, email: "yatim@example.com", role: "user", trialUsed: true })
      .returning();
    const [thesis] = await t.db
      .insert(schema.theses)
      .values({
        ownerId: profile!.id,
        title: "Uji",
        guidelineId: (await t.db.select().from(schema.guidelines))[0]!.id,
      })
      .returning();
    const key = `${userId}/${thesis!.id}/v1.docx`;
    await t.db.insert(schema.documents).values({
      thesisId: thesis!.id,
      versionNo: 1,
      originalFilename: "a.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      storageKey: key,
      sizeBytes: 10,
    });

    const storage = new FakeStorage();
    const runId = randomUUID();
    put(storage, key, OLD); // dirujuk database
    put(storage, `${key}.${runId}.report.v2.pdf`, OLD); // salinan PDF milik naskah yang ada
    put(storage, "gone/doc/v1.docx", OLD); // yatim
    put(storage, `gone/doc/v1.docx.${runId}.report.pdf`, OLD); // yatim
    put(storage, "baru/doc/v1.docx", FRESH); // baru diunggah: diberi tenggang
    put(storage, "guidelines/tmp/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.pdf", OLD); // sisa sementara
    put(storage, "guidelines/tmp/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.pdf", FRESH);
    put(storage, "guidelines/buku.pdf", OLD); // file pedoman tidak disentuh

    const scan = await findOrphans(t.db, storage, NOW);
    expect(scan.scanned).toBe(8);
    expect([...scan.keys].sort()).toEqual(
      [
        "gone/doc/v1.docx",
        `gone/doc/v1.docx.${runId}.report.pdf`,
        "guidelines/tmp/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.pdf",
      ].sort(),
    );
    expect(scan.bytes).toBe(30);

    const result = await cleanOrphans(t.db, storage, userId, NOW);
    expect(result.deleted).toBe(3);
    expect(storage.files.has(key)).toBe(true);
    expect(storage.files.has("gone/doc/v1.docx")).toBe(false);
    expect((await findOrphans(t.db, storage, NOW)).count).toBe(0);
    const audit = await t.db.select().from(schema.auditLogs);
    expect(audit.some((a) => a.action === "storage.clean_orphans")).toBe(true);
  });
});
