import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { badFormatDocx, goodDocx } from "@tests/fixtures/build-fixtures";
import { FakeStorage } from "@tests/helpers/fakes";
import { createAuthUser, createTestDb, type TestDb } from "@tests/helpers/test-db";
import { schema } from "../db";
import { compareIssues } from "../checkers/compare";
import * as access from "./access";
import * as checks from "./checks";
import * as theses from "./theses";

const NOW = new Date("2026-10-20T03:00:00Z");

describe("compareIssues (murni)", () => {
  const i = (id: string, fingerprint: string | null, category = "format") => ({
    id,
    category,
    fingerprint,
  });

  it("memisahkan diperbaiki, baru, dan tetap", () => {
    const r = compareIssues(
      [i("a", "x"), i("b", "y"), i("c", "z")],
      [i("d", "y"), i("e", "w")],
      ["format"],
    );
    expect(r.remaining.map((x) => x.id)).toEqual(["d"]);
    expect(r.added.map((x) => x.id)).toEqual(["e"]);
    expect(r.fixed.map((x) => x.id).sort()).toEqual(["a", "c"]);
  });

  it("fingerprint kembar dicocokkan satu lawan satu", () => {
    const r = compareIssues(
      [i("a", "x"), i("b", "x")],
      [i("c", "x"), i("d", "x"), i("e", "x")],
      ["format"],
    );
    expect(r.remaining).toHaveLength(2);
    expect(r.added).toHaveLength(1);
    expect(r.fixed).toHaveLength(0);
  });

  it("hanya membandingkan kategori yang dijalankan di kedua cek", () => {
    const r = compareIssues(
      [i("a", "x", "format")],
      [i("b", "x", "format"), i("c", "q", "ai")],
      ["format"],
    );
    expect(r.added).toHaveLength(0);
    expect(r.remaining).toHaveLength(1);
  });

  it("temuan tanpa fingerprint tidak pernah dicocokkan", () => {
    const r = compareIssues([i("a", null)], [i("b", null)], ["format"]);
    expect(r).toMatchObject({ fixed: [{ id: "a" }], added: [{ id: "b" }], remaining: [] });
  });
});

describe("perbandingan antarversi naskah", () => {
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

  async function setup() {
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
    const [profile] = await t.db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, userId));
    const thesis = await theses.getOwnedThesis(
      t.db,
      profile!,
      (await theses.createThesis(t.db, profile!, { title: "Skripsi Banding", guidelineId })).id,
    );
    const version = async (data: Uint8Array) => {
      const { document, uploadUrl } = await theses.startUpload(
        t.db,
        profile!,
        thesis,
        "n.docx",
        storage,
      );
      storage.upload(uploadUrl, data);
      const doc = await theses.confirmUpload(t.db, thesis, document, storage);
      const run = await checks.createCheckRun(t.db, profile!, thesis, doc, ["format"], NOW);
      return checks.executeCheckRun(t.db, storage, run.id, () => undefined);
    };
    return { version };
  }

  it("versi pertama: belum ada pembanding", async () => {
    const { version } = await setup();
    const v1 = await version(await badFormatDocx());
    const cmp = await checks.compareWithPrevious(t.db, v1);
    expect(cmp.base).toBeNull();
    expect(cmp.current.version_no).toBe(1);
    expect(cmp.counts).toEqual({ fixed: 0, added: 0, remaining: 0 });
  });

  it("naskah diperbaiki: temuan lama dihitung diperbaiki dan skor naik", async () => {
    const { version } = await setup();
    const v1 = await version(await badFormatDocx());
    const v2 = await version(await goodDocx());
    const cmp = await checks.compareWithPrevious(t.db, v2);
    expect(cmp.base).toMatchObject({ run_id: v1.id, version_no: 1 });
    expect(cmp.current.version_no).toBe(2);
    expect(cmp.counts.fixed).toBe(v1.issueCount - cmp.counts.remaining);
    expect(cmp.counts.fixed).toBeGreaterThan(0);
    expect(cmp.score_delta).toBeGreaterThan(0);
    expect(cmp.fixed.every((x) => x.category === "format")).toBe(true);
    expect(cmp.categories).toEqual(["format"]);
  });

  it("naskah sama diunggah lagi: semua temuan tetap, tidak ada yang baru", async () => {
    const { version } = await setup();
    const data = await badFormatDocx();
    const v1 = await version(data);
    const v2 = await version(data);
    const cmp = await checks.compareWithPrevious(t.db, v2);
    expect(cmp.counts).toEqual({ fixed: 0, added: 0, remaining: v1.issueCount });
    expect(cmp.score_delta).toBe(0);
  });

  it("naskah makin buruk: temuan baru muncul dan skor turun", async () => {
    const { version } = await setup();
    await version(await goodDocx());
    const v2 = await version(await badFormatDocx());
    const cmp = await checks.compareWithPrevious(t.db, v2);
    expect(cmp.counts.added).toBeGreaterThan(0);
    expect(cmp.score_delta).toBeLessThan(0);
  });
});
