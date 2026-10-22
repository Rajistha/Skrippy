import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { badFormatDocx, buildThesis, goodDocx } from "@tests/fixtures/build-fixtures";
import { FakeAuthAdmin, FakeStorage } from "@tests/helpers/fakes";
import { createAuthUser, createTestDb, type TestDb } from "@tests/helpers/test-db";
import { schema } from "../db";
import { AppError, CheckNotAllowed, NotFound } from "../errors";
import * as access from "./access";
import * as admin from "./admin";
import * as batches from "./batches";
import * as checks from "./checks";
import * as dictionary from "./dictionary";
import * as maintenance from "./maintenance";
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

type User = { profile: access.Profile; claims: access.TokenClaims };

async function adminId(): Promise<string> {
  const id = randomUUID();
  await createAuthUser(t.raw, id, "admin@example.com");
  return id;
}

async function newUser(kind: "trial" | "package" = "trial"): Promise<User> {
  const userId = randomUUID();
  const email = `${userId.slice(0, 6)}@example.com`;
  await createAuthUser(t.raw, userId, email);
  const [code] = await access.createCodes(
    t.db,
    await adminId(),
    { kind, ...(kind === "package" ? { paymentNote: "lunas" } : {}) },
    NOW,
  );
  const claims = { userId, email, fullName: "Rina" };
  await access.redeemCode(t.db, claims, code!.plain, NOW);
  const [profile] = await t.db.select().from(schema.profiles).where(eq(schema.profiles.id, userId));
  return { profile: profile!, claims };
}

async function upload(user: User, thesisId: string, data: Uint8Array, name = "naskah.docx") {
  const thesis = await theses.getOwnedThesis(t.db, user.profile, thesisId);
  const { document, uploadUrl } = await theses.startUpload(
    t.db,
    user.profile,
    thesis,
    name,
    storage,
  );
  storage.upload(uploadUrl, data);
  return theses.confirmUpload(t.db, thesis, document, storage);
}

async function setup(kind: "trial" | "package" = "trial") {
  storage = new FakeStorage();
  const user = await newUser(kind);
  const thesis = await theses.createThesis(t.db, user.profile, {
    title: "Skripsi Uji",
    guidelineId,
  });
  return { user, thesis };
}

describe("alur unggah dan cek", () => {
  it("unggah, cek, dan laporan lengkap", async () => {
    const { user, thesis } = await setup();
    const doc = await upload(user, thesis.id, await badFormatDocx());
    expect(doc).toMatchObject({ versionNo: 1, sizeBytes: expect.any(Number) });
    expect(doc.sha256).toHaveLength(64);

    const run = await checks.createCheckRun(t.db, user.profile, thesis, doc, ["format"], NOW);
    expect(run.status).toBe("queued");
    const done = await checks.executeCheckRun(t.db, storage, run.id, () => undefined);
    expect(done.status).toBe("completed");
    expect(done.issueCount).toBeGreaterThan(0);
    expect(Number(done.scoreTotal)).toBeLessThan(100);
    expect(Object.keys(done.scoreByCategory!)).toEqual(["format"]);

    const issues = await checks.listIssues(t.db, done);
    expect(issues[0]!.severity).toBe("critical"); // diurutkan dari paling parah
    expect(issues.every((i) => (i.excerpt ?? "").length <= 300)).toBe(true);
    expect(issues.find((i) => i.ruleCode === "FMT-002")?.message).toBe(
      "Margin kiri 3 cm, seharusnya 4 cm.",
    );
    expect(await checks.listIssues(t.db, done, { severity: "minor" })).not.toHaveLength(0);

    const [withScore] = await theses.listDocuments(t.db, thesis);
    expect(withScore).toMatchObject({ latestRunId: run.id, latestScore: Number(done.scoreTotal) });
  });

  it("aturan yang dimatikan pengguna dilewati dan tersimpan di snapshot cek itu saja", async () => {
    const { user, thesis } = await setup();
    const doc = await upload(user, thesis.id, await badFormatDocx());
    const run = await checks.createCheckRun(t.db, user.profile, thesis, doc, ["format"], NOW, [
      "FMT-002",
      "FMT-003",
    ]);
    expect((run.guidelineSnapshot as { disabled_rules: string[] }).disabled_rules).toEqual(
      expect.arrayContaining(["FMT-002", "FMT-003"]),
    );
    const done = await checks.executeCheckRun(t.db, storage, run.id, () => undefined);
    const codes = (await checks.listIssues(t.db, done)).map((i) => i.ruleCode);
    expect(codes).not.toContain("FMT-002");
    expect(codes).not.toContain("FMT-003");
    expect(codes).toContain("FMT-004");
    const [guideline] = await t.db
      .select()
      .from(schema.guidelines)
      .where(eq(schema.guidelines.id, guidelineId));
    expect((guideline!.rules as { disabled_rules?: string[] }).disabled_rules ?? []).toEqual([]);
  });

  it("kegagalan di sisi AI tidak menggagalkan cek aturan", async () => {
    const { user, thesis } = await setup("package");
    const doc = await upload(user, thesis.id, await badFormatDocx());
    const created = await checks.createCheckRun(t.db, user.profile, thesis, doc, ["format"], NOW);
    // Izin AI (kunci dan pengaturan admin) bukan bagian uji ini: tandai run meminta AI langsung.
    const [run] = await t.db
      .update(schema.checkRuns)
      .set({ checkTypes: ["format", "ai"] })
      .where(eq(schema.checkRuns.id, created.id))
      .returning();
    const ai = { complete: async () => "{}" } as unknown as Parameters<
      typeof checks.executeCheckRun
    >[4];
    // Tabel antrean AI hilang (misalnya migrasi belum diterapkan): dulu seluruh cek ikut gagal.
    await t.raw.exec("ALTER TABLE ai_slots RENAME TO ai_slots_off");
    const lines: string[] = [];
    let done;
    try {
      done = await checks.executeCheckRun(t.db, storage, run!.id, (l) => lines.push(l), ai);
    } finally {
      await t.raw.exec("ALTER TABLE ai_slots_off RENAME TO ai_slots");
    }
    expect(done.status).toBe("completed");
    expect(done.issueCount).toBeGreaterThan(0);
    expect(done.aiStatus).toBe("failed");
    expect(lines.some((l) => l.startsWith("check_ai_failed"))).toBe(true);
  });

  it("kamus admin dan daftar abaikan pengguna memengaruhi cek berikutnya", async () => {
    const { user, thesis } = await setup("package");
    const admin1 = await adminId();
    const data = await buildThesis({
      bodyBySection: { "BAB I": ["Kami memakai aplikasih untuk analisis dan dataset itu besar."] },
    });
    const spelling = async (): Promise<string[]> => {
      const doc = await upload(user, thesis.id, data);
      const run = await checks.createCheckRun(t.db, user.profile, thesis, doc, ["spelling"], NOW);
      const done = await checks.executeCheckRun(t.db, storage, run.id, () => undefined);
      return (await checks.listIssues(t.db, done)).map((i) => `${i.ruleCode} ${i.message}`);
    };
    expect((await spelling()).filter((m) => m.includes("aplikasih"))).toEqual([]);

    await expect(
      dictionary.addDictionaryEntry(t.db, admin1, { kind: "nonstandard", term: "aplikasih" }),
    ).rejects.toMatchObject({ code: "replacement_required" });
    const entry = await dictionary.addDictionaryEntry(t.db, admin1, {
      kind: "nonstandard",
      term: "Aplikasih",
      replacement: "aplikasi",
    });
    expect(entry.term).toBe("aplikasih");
    const found = (await spelling()).filter((m) => m.includes("aplikasih"));
    expect(found).toEqual(['EJA-001 Kata tidak baku "aplikasih", seharusnya "aplikasi".']);

    const row = await dictionary.addIgnored(t.db, user.profile.id, {
      ruleCode: "EJA-001",
      message: found[0]!.slice(8),
    });
    expect(row.text).toBe("aplikasih");
    expect((await spelling()).filter((m) => m.includes("aplikasih"))).toEqual([]);
    // Entri ganda tidak membuat baris baru, dan pengguna lain tidak terpengaruh.
    await dictionary.addIgnored(t.db, user.profile.id, {
      ruleCode: "EJA-001",
      message: found[0]!.slice(8),
    });
    expect(await dictionary.listIgnored(t.db, user.profile.id)).toHaveLength(1);
    await expect(dictionary.removeIgnored(t.db, randomUUID(), row.id)).rejects.toBeInstanceOf(
      NotFound,
    );
    await dictionary.removeIgnored(t.db, user.profile.id, row.id);
    expect((await spelling()).filter((m) => m.includes("aplikasih"))).toHaveLength(1);

    await dictionary.deleteDictionaryEntry(t.db, admin1, entry.id);
    expect((await spelling()).filter((m) => m.includes("aplikasih"))).toEqual([]);
    await expect(dictionary.deleteDictionaryEntry(t.db, admin1, entry.id)).rejects.toBeInstanceOf(
      NotFound,
    );
  });

  it("snapshot pedoman dibekukan saat cek dibuat", async () => {
    const { user, thesis } = await setup();
    const doc = await upload(user, thesis.id, await goodDocx());
    const run = await checks.createCheckRun(t.db, user.profile, thesis, doc, null, NOW);
    await t.db
      .update(schema.guidelines)
      .set({ rules: { page: { margins_cm: { left: 1 } } } })
      .where(eq(schema.guidelines.id, guidelineId));
    const [fresh] = await t.db
      .select()
      .from(schema.checkRuns)
      .where(eq(schema.checkRuns.id, run.id));
    expect(
      (fresh!.guidelineSnapshot as { page: { margins_cm: { left: number } } }).page.margins_cm.left,
    ).toBe(4);
    await t.db
      .update(schema.guidelines)
      .set({
        rules: (await import("../checkers/rules")).loadDefaults() as unknown as Record<
          string,
          unknown
        >,
      })
      .where(eq(schema.guidelines.id, guidelineId));
  });

  it("nomor versi bertambah dan dokumen belum dikonfirmasi tidak muncul", async () => {
    const { user, thesis } = await setup();
    await upload(user, thesis.id, await goodDocx());
    await upload(user, thesis.id, await buildThesis());
    await theses.startUpload(t.db, user.profile, thesis, "belum-selesai.docx", storage);
    const docs = await theses.listDocuments(t.db, thesis);
    expect(docs.map((d) => d.versionNo)).toEqual([2, 1]);
  });

  it("jenis cek tidak dikenal ditolak", async () => {
    const { user, thesis } = await setup();
    const doc = await upload(user, thesis.id, await goodDocx());
    await expect(
      checks.createCheckRun(t.db, user.profile, thesis, doc, ["grammar"], NOW),
    ).rejects.toThrow(/tidak dikenal/);
  });

  it("dokumen yang belum dikonfirmasi tidak bisa dicek", async () => {
    const { user, thesis } = await setup();
    const { document } = await theses.startUpload(t.db, user.profile, thesis, "x.docx", storage);
    await expect(
      checks.createCheckRun(t.db, user.profile, thesis, document, null, NOW),
    ).rejects.toThrow(/belum selesai/);
  });
});

describe("jatah", () => {
  it("trial: 3 cek lalu ditolak", async () => {
    const { user, thesis } = await setup();
    const doc = await upload(user, thesis.id, await goodDocx());
    for (let i = 0; i < 3; i++)
      await checks.createCheckRun(t.db, user.profile, thesis, doc, null, NOW);
    const err = await checks
      .createCheckRun(t.db, user.profile, thesis, doc, null, NOW)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CheckNotAllowed);
    expect((err as CheckNotAllowed).code).toBe("check_limit_reached");
    expect((await access.getAccessStatus(t.db, user.profile.id, NOW)).checksLeft).toBe(0);
  });

  it("kegagalan sistem mengembalikan jatah", async () => {
    const { user, thesis } = await setup();
    const doc = await upload(user, thesis.id, await goodDocx());
    const run = await checks.createCheckRun(t.db, user.profile, thesis, doc, null, NOW);
    expect((await access.getAccessStatus(t.db, user.profile.id, NOW)).checksLeft).toBe(2);

    storage.files.clear(); // file hilang
    const failed = await checks.executeCheckRun(t.db, storage, run.id, () => undefined);
    expect(failed).toMatchObject({ status: "failed", countsTowardLimit: false });
    expect(failed.errorCode).toBeTruthy();
    expect((await access.getAccessStatus(t.db, user.profile.id, NOW)).checksLeft).toBe(3);
  });

  it("run yang sudah selesai tidak diproses ulang (idempoten)", async () => {
    const { user, thesis } = await setup();
    const doc = await upload(user, thesis.id, await badFormatDocx());
    const run = await checks.createCheckRun(t.db, user.profile, thesis, doc, ["format"], NOW);
    const first = await checks.executeCheckRun(t.db, storage, run.id, () => undefined);
    const second = await checks.executeCheckRun(t.db, storage, run.id, () => undefined);
    expect(second.finishedAt).toEqual(first.finishedAt);
    expect(await checks.listIssues(t.db, run)).toHaveLength(first.issueCount);
  });

  it("dua eksekusi bersamaan tidak menggandakan temuan", async () => {
    const { user, thesis } = await setup();
    const doc = await upload(user, thesis.id, await badFormatDocx());
    const run = await checks.createCheckRun(t.db, user.profile, thesis, doc, ["format"], NOW);
    const [a] = await Promise.all([
      checks.executeCheckRun(t.db, storage, run.id, () => undefined),
      checks.executeCheckRun(t.db, storage, run.id, () => undefined),
    ]);
    const issues = await checks.listIssues(t.db, run);
    expect(issues).toHaveLength(
      (await t.db.select().from(schema.checkRuns).where(eq(schema.checkRuns.id, run.id)))[0]!
        .issueCount,
    );
    expect(a.id).toBe(run.id);
  });
});

describe("otorisasi lintas pengguna", () => {
  it("pengguna lain mendapat 404 untuk skripsi, dokumen, dan hasil cek", async () => {
    const { user, thesis } = await setup();
    const other = await newUser();
    const doc = await upload(user, thesis.id, await badFormatDocx());
    const run = await checks.createCheckRun(t.db, user.profile, thesis, doc, ["format"], NOW);
    await checks.executeCheckRun(t.db, storage, run.id, () => undefined);

    await expect(theses.getOwnedThesis(t.db, other.profile, thesis.id)).rejects.toBeInstanceOf(
      NotFound,
    );
    await expect(theses.getOwnedDocument(t.db, other.profile, doc.id)).rejects.toBeInstanceOf(
      NotFound,
    );
    await expect(checks.getOwnedRun(t.db, other.profile, run.id)).rejects.toBeInstanceOf(NotFound);
    expect(await theses.listTheses(t.db, other.profile)).toEqual([]);
  });

  it("superadmin boleh membaca milik siapa pun", async () => {
    const { user, thesis } = await setup();
    const owner = await access
      .ensureSuperadminProfile(t.db, { userId: randomUUID(), email: "owner@example.com" }, NOW)
      .catch(async () => {
        const id = randomUUID();
        await createAuthUser(t.raw, id, "owner@example.com");
        return access.ensureSuperadminProfile(
          t.db,
          { userId: id, email: "owner@example.com" },
          NOW,
        );
      });
    expect((await theses.getOwnedThesis(t.db, owner!, thesis.id)).id).toBe(thesis.id);
    expect(user.profile.role).toBe("user");
  });

  it("status temuan hanya bisa diubah lewat run miliknya", async () => {
    const { user, thesis } = await setup();
    const doc = await upload(user, thesis.id, await badFormatDocx());
    const run = await checks.createCheckRun(t.db, user.profile, thesis, doc, ["format"], NOW);
    await checks.executeCheckRun(t.db, storage, run.id, () => undefined);
    const [issue] = await checks.listIssues(t.db, run);
    expect((await checks.setIssueStatus(t.db, run, issue!.id, "false_positive")).userStatus).toBe(
      "false_positive",
    );
    await expect(
      checks.setIssueStatus(t.db, { id: randomUUID() }, issue!.id, "ignored"),
    ).rejects.toBeInstanceOf(NotFound);
  });
});

describe("validasi unggahan", () => {
  const cases: Array<[string, Uint8Array, RegExp]> = [
    ["kosong", new Uint8Array(0), /File kosong/],
    ["bukan docx", new TextEncoder().encode("%PDF-1.4 bukan docx"), /bukan dokumen Word/],
    [
      "terenkripsi (OLE)",
      Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, ...new Array(100).fill(0)]),
      /terkunci kata sandi/,
    ],
    ["zip rusak", Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), /rusak/],
  ];

  it.each(cases)("%s ditolak dan file dibersihkan", async (_name, data, message) => {
    const { user, thesis } = await setup();
    const { document, uploadUrl } = await theses.startUpload(
      t.db,
      user.profile,
      thesis,
      "x.docx",
      storage,
    );
    storage.upload(uploadUrl, data);
    await expect(theses.confirmUpload(t.db, thesis, document, storage)).rejects.toThrow(message);
    expect(storage.removed).toContain(document.storageKey);
    expect(await theses.listDocuments(t.db, thesis)).toEqual([]);
  });

  it("ekstensi selain .docx ditolak sejak awal", async () => {
    const { user, thesis } = await setup();
    await expect(
      theses.startUpload(t.db, user.profile, thesis, "a.pdf", storage),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("file yang belum diunggah ke storage", async () => {
    const { user, thesis } = await setup();
    const { document } = await theses.startUpload(t.db, user.profile, thesis, "x.docx", storage);
    await expect(theses.confirmUpload(t.db, thesis, document, storage)).rejects.toThrow(
      /belum terunggah/,
    );
  });
});

describe("penghapusan", () => {
  it("hapus dokumen: file hilang dan kutipan temuan dikosongkan", async () => {
    const { user, thesis } = await setup();
    const doc = await upload(user, thesis.id, await badFormatDocx());
    const run = await checks.createCheckRun(t.db, user.profile, thesis, doc, ["format"], NOW);
    await checks.executeCheckRun(t.db, storage, run.id, () => undefined);
    expect((await checks.listIssues(t.db, run)).some((i) => i.excerpt)).toBe(true);

    await theses.deleteDocument(t.db, doc, storage);
    expect(storage.files.size).toBe(0);
    expect((await checks.listIssues(t.db, run)).every((i) => i.excerpt === null)).toBe(true);
    await expect(theses.getOwnedDocument(t.db, user.profile, doc.id)).rejects.toBeInstanceOf(
      NotFound,
    );
  });

  it("hapus akun: semua data pribadi hilang, catatan pembayaran kode tetap", async () => {
    const { user, thesis } = await setup("package");
    await upload(user, thesis.id, await goodDocx());
    await theses.deleteAccountData(t.db, user.profile, storage);
    expect(storage.files.size).toBe(0);
    expect(
      await t.db.select().from(schema.profiles).where(eq(schema.profiles.id, user.profile.id)),
    ).toEqual([]);
    expect(
      await t.db.select().from(schema.theses).where(eq(schema.theses.ownerId, user.profile.id)),
    ).toEqual([]);
    expect(
      await t.db
        .select()
        .from(schema.accessGrants)
        .where(eq(schema.accessGrants.userId, user.profile.id)),
    ).toEqual([]);
    const codes = await t.db.select().from(schema.accessCodes);
    expect(codes.some((c) => c.kind === "package" && c.paymentNote === "lunas")).toBe(true);
  });
});

describe("pemeliharaan harian", () => {
  it("retensi menghapus naskah tidak aktif dan menjaga yang aktif", async () => {
    const { user, thesis } = await setup();
    const doc = await upload(user, thesis.id, await goodDocx());
    const active = await theses.createThesis(t.db, user.profile, { title: "Aktif", guidelineId });
    await upload(user, active.id, await goodDocx());
    await t.db
      .update(schema.theses)
      .set({ lastActivityAt: new Date(Date.now() - 31 * DAY) })
      .where(eq(schema.theses.id, thesis.id));

    const deleted = await maintenance.enforceRetention(t.db, storage, 30, new Date());
    expect(deleted).toBeGreaterThanOrEqual(1);
    const [row] = await t.db.select().from(schema.documents).where(eq(schema.documents.id, doc.id));
    expect(row!.deletedAt).not.toBeNull();
    expect(await theses.listDocuments(t.db, active)).toHaveLength(1);
    // idempoten: dijalankan lagi tidak menghapus apa pun yang sama
    expect(await maintenance.enforceRetention(t.db, storage, 30, new Date())).toBe(0);
  });

  it("cek yang macet ditandai timeout dan jatah kembali, idempoten", async () => {
    const { user, thesis } = await setup();
    const doc = await upload(user, thesis.id, await goodDocx());
    const run = await checks.createCheckRun(
      t.db,
      user.profile,
      thesis,
      doc,
      null,
      new Date(Date.now() - 20 * 60_000),
    );
    await t.db
      .update(schema.checkRuns)
      .set({ status: "processing", startedAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(schema.checkRuns.id, run.id));
    expect((await access.getAccessStatus(t.db, user.profile.id)).checksLeft).toBe(2);

    expect(await maintenance.failStuckRuns(t.db, new Date())).toBeGreaterThanOrEqual(1);
    const [after] = await t.db
      .select()
      .from(schema.checkRuns)
      .where(eq(schema.checkRuns.id, run.id));
    expect(after).toMatchObject({ status: "failed", errorCode: "timeout" });
    expect((await access.getAccessStatus(t.db, user.profile.id)).checksLeft).toBe(3);
    expect(await maintenance.failStuckRuns(t.db, new Date())).toBe(0);
  });

  it("unggahan yatim dan akun auth tanpa profil dibersihkan", async () => {
    const { user, thesis } = await setup();
    const { document } = await theses.startUpload(
      t.db,
      user.profile,
      thesis,
      "yatim.docx",
      storage,
    );
    await t.db
      .update(schema.documents)
      .set({ createdAt: new Date(Date.now() - 2 * DAY) })
      .where(eq(schema.documents.id, document.id));
    expect(await maintenance.cleanOrphanUploads(t.db, storage, new Date())).toBe(1);
    expect(storage.removed).toContain(document.storageKey);

    const auth = new FakeAuthAdmin();
    auth.users = [
      { id: randomUUID(), createdAt: new Date(Date.now() - 10 * DAY) }, // tua, tanpa profil -> dihapus
      { id: randomUUID(), createdAt: new Date(Date.now() - 1 * DAY) }, // baru -> tetap
      { id: user.profile.id, createdAt: new Date(Date.now() - 30 * DAY) }, // punya profil -> tetap
    ];
    expect(await maintenance.deleteUnusedAuthAccounts(t.db, auth, new Date())).toBe(1);
    expect(await maintenance.deleteUnusedAuthAccounts(t.db, auth, new Date())).toBe(0);
  });

  it("runMaintenance dua kali berturut-turut tidak merusak data", async () => {
    const { user, thesis } = await setup();
    await upload(user, thesis.id, await goodDocx());
    const deps = { db: t.db, storage, authAdmin: new FakeAuthAdmin(), retentionDays: 30 };
    await maintenance.runMaintenance(deps);
    const second = await maintenance.runMaintenance(deps);
    expect(second).toEqual({
      retentionDocumentsDeleted: 0,
      orphanUploadsDeleted: 0,
      unusedAuthAccountsDeleted: 0,
      stuckRunsFailed: 0,
      redeemAttemptsPruned: 0,
      remindersSent: 0,
      remindersSkipped: 0,
    });
    expect(await theses.listDocuments(t.db, thesis)).toHaveLength(1);
  });
});

describe("panel admin", () => {
  it("daftar kode menampilkan status dan penukar, tanpa kode asli", async () => {
    const actor = await adminId();
    const [c] = await access.createCodes(
      t.db,
      actor,
      { kind: "trial", recipientNote: "Rina" },
      NOW,
    );
    await access.revokeCode(t.db, actor, c!.record.id, NOW);
    const { codes } = await batches.getBatch(t.db, c!.record.batchId!, NOW);
    expect(codes.find((r) => r.id === c!.record.id)!.status).toBe("revoked");
  });

  it("pesan WhatsApp berisi kode, jenis, batas waktu, dan tautan", async () => {
    const [c] = await access.createCodes(
      t.db,
      await adminId(),
      { kind: "package", recipientNote: "Rina", paymentNote: "lunas" },
      NOW,
    );
    const msg = admin.whatsappMessage(c!, "Paket Skripsi");
    expect(msg).toContain("Halo Rina, ini kode akses Skrippy kamu:");
    expect(msg).toContain(c!.plain);
    expect(msg).toContain("Jenis: Paket Skripsi (30 hari, cek tanpa batas)");
    expect(msg).not.toContain("Pakai sebelum"); // tanpa batas waktu
    expect(msg).toContain(`/masuk?kode=${c!.plain}`);
  });

  it("pesan WhatsApp mencantumkan batas waktu bila ada", async () => {
    const validUntil = new Date("2099-11-03T16:59:59.999Z");
    const [c] = await access.createCodes(
      t.db,
      await adminId(),
      { kind: "package", validUntil },
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(admin.whatsappMessage(c!, "Paket Skripsi")).not.toContain("Pakai sebelum"); // lebih dari 20 tahun dianggap tanpa batas
    const near = new Date(Date.now() + 10 * 86_400_000);
    const [d] = await access.createCodes(t.db, await adminId(), {
      kind: "package",
      validUntil: near,
    });
    expect(admin.whatsappMessage(d!, "Paket Skripsi")).toContain("Pakai sebelum:");
  });

  it("rekap tidak menghitung pemilik", async () => {
    await newUser("package");
    const s = await admin.summary(t.db, NOW);
    expect(s.activePackages).toBeGreaterThanOrEqual(1);
    expect(s.paymentsThisMonthIdr).toBeGreaterThanOrEqual(0);
  });
});
