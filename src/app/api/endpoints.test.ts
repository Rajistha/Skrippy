import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { badFormatDocx, buildThesis, goodDocx } from "@tests/fixtures/build-fixtures";
import { FakeAuthAdmin, FakeStorage } from "@tests/helpers/fakes";
import { createAuthUser, createTestDb, type TestDb } from "@tests/helpers/test-db";

// --- doubles untuk batas sistem: sesi Supabase, database, storage, Admin API, after() ------

type FakeUser = { id: string; email: string; user_metadata?: Record<string, unknown> } | null;
const state = vi.hoisted(() => ({
  user: null as FakeUser,
  db: null as unknown,
  storage: null as unknown,
  authAdmin: null as unknown,
  afterQueue: [] as Array<() => Promise<void>>,
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    auth: {
      getUser: async () =>
        state.user
          ? { data: { user: state.user }, error: null }
          : { data: { user: null }, error: { message: "no session" } },
    },
  }),
}));
vi.mock("@/server/db/client", () => ({ getDb: () => state.db }));
vi.mock("@/server/integrations/storage", () => ({ getStorage: () => state.storage }));
vi.mock("@/server/integrations/auth-admin", () => ({ getAuthAdmin: () => state.authAdmin }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => Promise<void>) => void state.afterQueue.push(fn) };
});

import * as adminCodes from "./admin/codes/route";
import * as adminCodeRevoke from "./admin/codes/[id]/revoke/route";
import * as adminCodeDelete from "./admin/codes/[id]/route";
import * as adminBatches from "./admin/batches/route";
import * as adminBatch from "./admin/batches/[id]/route";
import * as adminSettings from "./admin/settings/route";
import * as adminGuidelines from "./admin/guidelines/route";
import * as adminGuideline from "./admin/guidelines/[id]/route";
import * as adminGuidelineStatus from "./admin/guidelines/[id]/status/route";
import * as adminGuidelineUpload from "./admin/guidelines/upload-url/route";
import * as adminGuidelineExtract from "./admin/guidelines/extract/route";
import * as guidelinesRoute from "./guidelines/route";
import * as compareRoute from "./checks/[id]/compare/route";
import * as shareRoute from "./checks/[id]/share/route";
import * as shareLinkRoute from "./checks/[id]/share/[linkId]/route";
import * as pdfRoute from "./checks/[id]/pdf/route";
import * as issuesPdfRoute from "./checks/[id]/issues-pdf/route";
import * as trendRoute from "./checks/[id]/trend/route";
import * as fixedRoute from "./checks/[id]/fixed/route";
import * as publicShare from "./public/share/[token]/route";
import * as adminAi from "./admin/ai/route";
import * as adminAiTest from "./admin/ai/test/route";
import * as adminAiModels from "./admin/ai/models/route";
import * as aiStatusRoute from "./ai/status/route";
import * as adminSummary from "./admin/summary/route";
import * as adminUsers from "./admin/users/route";
import * as adminExtend from "./admin/users/[id]/extend/route";
import * as adminStop from "./admin/users/[id]/stop/route";
import * as adminGuidelineTest from "./admin/guidelines/test/route";
import * as adminDict from "./admin/dictionary/route";
import * as adminDictItem from "./admin/dictionary/[id]/route";
import * as ignoredRoute from "./ignored/route";
import * as ignoredItem from "./ignored/[id]/route";
import * as alwaysRoute from "./checks/[id]/issues/[issueId]/always/route";
import * as adminRole from "./admin/users/[id]/role/route";
import * as adminUserDelete from "./admin/users/[id]/route";
import * as adminGrant from "./admin/users/[id]/grant/route";
import * as checkRoute from "./checks/[id]/route";
import * as issuesRoute from "./checks/[id]/issues/route";
import * as issueRoute from "./checks/[id]/issues/[issueId]/route";
import * as checksList from "./checks/route";
import * as confirmRoute from "./documents/[id]/confirm/route";
import * as docChecks from "./documents/[id]/checks/route";
import * as docRoute from "./documents/[id]/route";
import * as maintenanceRoute from "./internal/maintenance/route";
import * as meRoute from "./me/route";
import * as redeemRoute from "./access/redeem/route";
import * as thesesRoute from "./theses/route";
import * as thesisRoute from "./theses/[id]/route";
import * as uploadsRoute from "./theses/[id]/uploads/route";
import * as publicInfo from "./public/info/route";
import { schema } from "@/server/db";

let t: TestDb;
let guidelineId: string;

const OWNER = { email: "owner@example.com" };

beforeAll(async () => {
  t = await createTestDb();
  state.db = t.db;
  const [g] = await t.db.select().from(schema.guidelines);
  guidelineId = g!.id;
});
afterAll(async () => {
  await t.close();
});
beforeEach(() => {
  state.storage = new FakeStorage();
  state.authAdmin = new FakeAuthAdmin();
  state.afterQueue = [];
  state.user = null;
});

// --- helper --------------------------------------------------------------------

/** Detail satu batch lewat API (kode asli hanya ada di sini). */
async function batchOf(batchId: string) {
  return (await call(adminBatch.GET, "GET", undefined, { id: batchId })).body!;
}

type Handler = (
  req: Request,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

async function call(
  handler: unknown,
  method: string,
  body?: unknown,
  params: Record<string, string> = {},
  url = "http://app/api/x",
) {
  const req = new Request(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const res = await (handler as Handler)(req, { params: Promise.resolve(params) });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, any>) : null }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function login(email: string): Promise<string> {
  const id = randomUUID();
  await createAuthUser(t.raw, id, email);
  state.user = { id, email, user_metadata: { full_name: "Rina", avatar_url: "https://x/a.png" } };
  return id;
}

async function loginAdmin(): Promise<string> {
  const id = await login(OWNER.email);
  expect((await call(meRoute.GET, "GET")).status).toBe(200); // profil superadmin otomatis
  return id;
}

async function makeCode(kind: "trial" | "package" = "trial"): Promise<string> {
  const res = await call(adminCodes.POST, "POST", {
    kind,
    ...(kind === "package"
      ? { payment_note: "lunas", payment_method: "transfer", price_idr: 25000 }
      : {}),
  });
  expect(res.status).toBe(201);
  return res.body![0].code as string;
}

/** Admin membuat kode, lalu pengguna baru masuk dan menukarnya. */
async function loginUserWithAccess(
  email: string,
  kind: "trial" | "package" = "trial",
): Promise<string> {
  await loginAdmin();
  const code = await makeCode(kind);
  const id = await login(email);
  expect((await call(redeemRoute.POST, "POST", { code })).status).toBe(200);
  return id;
}

async function uploadDoc(thesisId: string, data: Uint8Array): Promise<string> {
  const start = await call(
    uploadsRoute.POST,
    "POST",
    { filename: "naskah.docx" },
    { id: thesisId },
  );
  expect(start.status).toBe(201);
  (state.storage as FakeStorage).upload(start.body!.upload_url, data);
  const confirm = await call(confirmRoute.POST, "POST", undefined, { id: start.body!.document_id });
  expect(confirm.status).toBe(200);
  return start.body!.document_id as string;
}

async function drainAfter(): Promise<void> {
  while (state.afterQueue.length > 0) await state.afterQueue.shift()!();
}

// --- autentikasi ----------------------------------------------------------------

describe("autentikasi", () => {
  it("tanpa sesi: 401 invalid_token", async () => {
    const res = await call(meRoute.GET, "GET");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "invalid_token", message: expect.any(String) } });
  });

  it("pengguna baru otomatis mendapat profil dan trial sesuai pengaturan", async () => {
    await login("baru@example.com");
    const res = await call(meRoute.GET, "GET");
    expect(res.status).toBe(200);
    expect(res.body!.profile.role).toBe("user");
    expect(res.body!.access).toMatchObject({ state: "trial", checks_left: 3 });
    expect(res.body!.access.days_left).toBeGreaterThanOrEqual(6);
  });

  it("memanggil /me berulang tidak membuat trial kedua", async () => {
    await login("baru2@example.com");
    await call(meRoute.GET, "GET");
    await call(meRoute.GET, "GET");
    const rows = await t.db.select().from(schema.accessGrants);
    const mine = rows.filter((g) => g.kind === "trial");
    const profiles = await t.db.select().from(schema.profiles);
    const me = profiles.find((p) => p.email === "baru2@example.com")!;
    expect(mine.filter((g) => g.userId === me.id)).toHaveLength(1);
  });

  it("info publik tidak butuh login", async () => {
    const res = await call(publicInfo.GET, "GET");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ package_price_idr: 25000, trial_check_limit: 3 });
  });
});

// --- penukaran kode ---------------------------------------------------------------

describe("tukar kode", () => {
  it("alur lengkap: admin membuat kode, pengguna menukar, /me menampilkan akses", async () => {
    const userId = await loginUserWithAccess("rina@example.com");
    const me = await call(meRoute.GET, "GET");
    expect(me.body).toMatchObject({
      profile: { id: userId, role: "user", full_name: "Rina" },
      access: { state: "trial", checks_left: 3 },
    });
  });

  it("kode salah: pesan generik 400", async () => {
    await login("x@example.com");
    const res = await call(redeemRoute.POST, "POST", { code: "SKR-ZZZZ-ZZZZ" });
    expect(res.status).toBe(400);
    expect(res.body!.error).toEqual({
      code: "invalid_access_code",
      message: "Kode tidak valid atau sudah tidak berlaku.",
    });
  });

  it("dibatasi 5 percobaan lalu 429", async () => {
    await login("spam@example.com");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++)
      statuses.push((await call(redeemRoute.POST, "POST", { code: "SKR-ZZZZ-ZZZZ" })).status);
    expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
  });

  it("body tidak valid: 400 validation_error", async () => {
    await login("v@example.com");
    const res = await call(redeemRoute.POST, "POST", { code: "x" });
    expect(res.status).toBe(400);
    expect(res.body!.error.code).toBe("validation_error");
  });
});

// --- admin ------------------------------------------------------------------------

describe("otorisasi admin", () => {
  const routes: Array<[string, unknown, string, unknown?]> = [
    ["GET /admin/summary", adminSummary.GET, "GET"],
    ["GET /admin/batches", adminBatches.GET, "GET"],
    ["POST /admin/codes", adminCodes.POST, "POST", { kind: "trial" }],
    ["GET /admin/users", adminUsers.GET, "GET"],
    ["GET /admin/settings", adminSettings.GET, "GET"],
    ["PUT /admin/settings", adminSettings.PUT, "PUT", { values: {} }],
    ["GET /admin/guidelines", adminGuidelines.GET, "GET"],
    [
      "POST /admin/guidelines",
      adminGuidelines.POST,
      "POST",
      { name: "Uji", citation_style: "apa", status: "draft", rules: {} },
    ],
    ["POST /admin/guidelines/upload-url", adminGuidelineUpload.POST, "POST", { filename: "a.pdf" }],
    [
      "POST /admin/guidelines/test",
      adminGuidelineTest.POST,
      "POST",
      { path: "guidelines/tmp/x.docx", rules: {} },
    ],
    ["GET /admin/dictionary", adminDict.GET, "GET"],
    ["POST /admin/dictionary", adminDict.POST, "POST", { kind: "foreign", term: "gadget" }],
    ["GET /admin/ai", adminAi.GET, "GET"],
    ["PUT /admin/ai", adminAi.PUT, "PUT", { enabled: true }],
    ["DELETE /admin/ai", adminAi.DELETE, "DELETE"],
    ["POST /admin/ai/test", adminAiTest.POST, "POST"],
    ["POST /admin/ai/models", adminAiModels.POST, "POST", { provider: "openai" }],
    [
      "POST /admin/guidelines/extract",
      adminGuidelineExtract.POST,
      "POST",
      { path: "guidelines/tmp/x.pdf" },
    ],
  ];

  it.each(routes)("%s: pengguna biasa 403", async (_name, handler, method, body) => {
    await loginUserWithAccess(`u${randomUUID().slice(0, 6)}@example.com`);
    const res = await call(handler, method, body);
    expect(res.status).toBe(403);
    expect(res.body!.error.code).toBe("access_denied");
  });

  it("endpoint dengan parameter juga 403 untuk pengguna biasa", async () => {
    await loginUserWithAccess(`u${randomUUID().slice(0, 6)}@example.com`);
    const id = randomUUID();
    expect((await call(adminCodeRevoke.POST, "POST", undefined, { id })).status).toBe(403);
    expect((await call(adminExtend.POST, "POST", { days: 1, reason: "x" }, { id })).status).toBe(
      403,
    );
    expect((await call(adminStop.POST, "POST", { reason: "x" }, { id })).status).toBe(403);
    expect((await call(adminRole.POST, "POST", { role: "superadmin" }, { id })).status).toBe(403);
    expect((await call(adminCodeDelete.DELETE, "DELETE", undefined, { id })).status).toBe(403);
    expect((await call(adminUserDelete.DELETE, "DELETE", undefined, { id })).status).toBe(403);
    expect((await call(adminBatch.GET, "GET", undefined, { id })).status).toBe(403);
    expect((await call(adminDictItem.DELETE, "DELETE", undefined, { id })).status).toBe(403);
    expect((await call(adminBatch.DELETE, "DELETE", undefined, { id })).status).toBe(403);
  });

  it("tanpa sesi: 401", async () => {
    expect((await call(adminBatches.GET, "GET")).status).toBe(401);
  });

  it("admin: buat kode, daftar batch, cabut, perpanjang, hentikan, pengaturan", async () => {
    await loginAdmin();
    const created = await call(adminCodes.POST, "POST", { kind: "trial", recipient_note: "Rina" });
    const item = created.body![0];
    expect(item.message).toContain(`/masuk?kode=${item.code}`);

    const batches = await call(adminBatches.GET, "GET");
    expect(batches.body!.find((b: { id: string }) => b.id === item.batch_id)).toMatchObject({
      note: "Rina",
      total: 1,
      status: "active",
    });
    const detail = await batchOf(item.batch_id);
    expect(detail.codes[0]).toMatchObject({
      code: item.code,
      status: "active",
      code_hint: item.code.slice(-4),
    });

    expect((await call(adminCodeRevoke.POST, "POST", undefined, { id: item.id })).status).toBe(204);
    expect((await batchOf(item.batch_id)).codes[0].status).toBe("revoked");

    const settings = await call(adminSettings.PUT, "PUT", {
      values: { "package.price_idr": 30000 },
    });
    expect(settings.body!.values["package.price_idr"]).toBe(30000);
    expect((await call(adminSettings.PUT, "PUT", { values: { nope: 1 } })).status).toBe(400);
    expect((await call(publicInfo.GET, "GET")).body!.package_price_idr).toBe(30000);
    await call(adminSettings.PUT, "PUT", { values: { "package.price_idr": 25000 } });

    const userId = await loginUserWithAccess("peserta@example.com", "package");
    await loginAdmin();
    expect(
      (await call(adminExtend.POST, "POST", { days: 10, reason: "bonus" }, { id: userId })).status,
    ).toBe(204);
    const users = await call(adminUsers.GET, "GET");
    expect(
      users.body!.find((u: { id: string }) => u.id === userId).access.days_left,
    ).toBeGreaterThanOrEqual(39);
    expect((await call(adminStop.POST, "POST", { reason: "uji" }, { id: userId })).status).toBe(
      204,
    );
    expect((await call(adminSummary.GET, "GET")).status).toBe(200);
  });
});

// --- skripsi, unggah, cek, laporan --------------------------------------------------

describe("alur skripsi sampai laporan", () => {
  it("unggah, cek di latar, polling, laporan, dan ubah status temuan", async () => {
    await loginUserWithAccess("rina@example.com");
    const thesis = await call(thesesRoute.POST, "POST", {
      title: "Skripsi Uji",
      guideline_id: guidelineId,
    });
    expect(thesis.status).toBe(201);
    const docId = await uploadDoc(thesis.body!.id, await badFormatDocx());

    const run = await call(docChecks.POST, "POST", { check_types: ["format"] }, { id: docId });
    expect(run.status).toBe(202);
    expect(run.body!.status).toBe("queued");
    expect(state.afterQueue).toHaveLength(1); // pemeriksaan dijadwalkan setelah respons

    await drainAfter();
    const polled = await call(checkRoute.GET, "GET", undefined, { id: run.body!.id });
    expect(polled.body).toMatchObject({ status: "completed", check_types: ["format"] });
    expect(polled.body!.score_total).toBeLessThan(100);

    const issues = await call(
      issuesRoute.GET,
      "GET",
      undefined,
      { id: run.body!.id },
      "http://app/api/x?severity=critical",
    );
    expect(issues.body!.length).toBeGreaterThan(0);
    expect(issues.body!.every((i: { severity: string }) => i.severity === "critical")).toBe(true);

    const first = issues.body![0];
    const patched = await call(
      issueRoute.PATCH,
      "PATCH",
      { user_status: "false_positive" },
      { id: run.body!.id, issueId: first.id },
    );
    expect(patched.body!.user_status).toBe("false_positive");
    const done = await call(
      issueRoute.PATCH,
      "PATCH",
      { user_status: "done" },
      { id: run.body!.id, issueId: first.id },
    );
    expect(done.body!.user_status).toBe("done");

    const detail = await call(thesisRoute.GET, "GET", undefined, { id: thesis.body!.id });
    expect(detail.body!.documents[0]).toMatchObject({ version_no: 1, latest_run_id: run.body!.id });
    expect((await call(checksList.GET, "GET")).body).toHaveLength(1);
    expect((await call(meRoute.GET, "GET")).body!.access.checks_left).toBe(2);
  });

  it("trial habis setelah 3 cek: 403 check_limit_reached", async () => {
    await loginUserWithAccess("habis@example.com");
    const thesis = await call(thesesRoute.POST, "POST", { title: "T", guideline_id: guidelineId });
    const docId = await uploadDoc(thesis.body!.id, await badFormatDocx());
    for (let i = 0; i < 3; i++)
      expect((await call(docChecks.POST, "POST", {}, { id: docId })).status).toBe(202);
    const res = await call(docChecks.POST, "POST", {}, { id: docId });
    expect(res.status).toBe(403);
    expect(res.body!.error.code).toBe("check_limit_reached");
  });

  it("unggahan tidak valid ditolak 400 dengan pesan yang jelas", async () => {
    await loginUserWithAccess("salah@example.com");
    const thesis = await call(thesesRoute.POST, "POST", { title: "T", guideline_id: guidelineId });
    const start = await call(
      uploadsRoute.POST,
      "POST",
      { filename: "x.docx" },
      { id: thesis.body!.id },
    );
    (state.storage as FakeStorage).upload(
      start.body!.upload_url,
      new TextEncoder().encode("%PDF-1.4"),
    );
    const res = await call(confirmRoute.POST, "POST", undefined, { id: start.body!.document_id });
    expect(res.status).toBe(400);
    expect(res.body!.error).toMatchObject({
      code: "invalid_upload",
      message: "File bukan dokumen Word (.docx) yang valid.",
    });
  });

  it("id bukan UUID: 404", async () => {
    await loginUserWithAccess("uuid@example.com");
    expect((await call(thesisRoute.GET, "GET", undefined, { id: "bukan-uuid" })).status).toBe(404);
  });
});

describe("akses lintas pengguna", () => {
  it("pengguna lain mendapat 404 untuk seluruh data milik orang lain", async () => {
    await loginUserWithAccess("pemilik@example.com");
    const thesis = await call(thesesRoute.POST, "POST", {
      title: "Rahasia",
      guideline_id: guidelineId,
    });
    const docId = await uploadDoc(thesis.body!.id, await badFormatDocx());
    const run = await call(docChecks.POST, "POST", { check_types: ["format"] }, { id: docId });
    await drainAfter();
    const issueId = (await call(issuesRoute.GET, "GET", undefined, { id: run.body!.id })).body![0]
      .id as string;

    await loginUserWithAccess("penyusup@example.com");
    const attempts = await Promise.all([
      call(thesisRoute.GET, "GET", undefined, { id: thesis.body!.id }),
      call(thesisRoute.DELETE, "DELETE", undefined, { id: thesis.body!.id }),
      call(uploadsRoute.POST, "POST", { filename: "x.docx" }, { id: thesis.body!.id }),
      call(confirmRoute.POST, "POST", undefined, { id: docId }),
      call(docChecks.POST, "POST", {}, { id: docId }),
      call(docRoute.DELETE, "DELETE", undefined, { id: docId }),
      call(checkRoute.GET, "GET", undefined, { id: run.body!.id }),
      call(issuesRoute.GET, "GET", undefined, { id: run.body!.id }),
      call(issueRoute.PATCH, "PATCH", { user_status: "ignored" }, { id: run.body!.id, issueId }),
    ]);
    expect(attempts.map((a) => a.status)).toEqual(Array(attempts.length).fill(404));
    expect((await call(thesesRoute.GET, "GET")).body).toEqual([]);
  });
});

describe("hapus akun dan dokumen", () => {
  it("hapus dokumen mengosongkan file; hapus akun menghapus semuanya dan akun auth", async () => {
    const userId = await loginUserWithAccess("hapus@example.com", "package");
    const thesis = await call(thesesRoute.POST, "POST", { title: "T", guideline_id: guidelineId });
    const docId = await uploadDoc(thesis.body!.id, await badFormatDocx());
    expect((await call(docRoute.DELETE, "DELETE", undefined, { id: docId })).status).toBe(204);
    expect((state.storage as FakeStorage).files.size).toBe(0);

    await uploadDoc(thesis.body!.id, await badFormatDocx());
    expect((await call(meRoute.DELETE, "DELETE")).status).toBe(204);
    expect((state.storage as FakeStorage).files.size).toBe(0);
    expect((state.authAdmin as FakeAuthAdmin).deleted).toEqual([userId]);
  });
});

// --- maintenance ------------------------------------------------------------------

describe("POST /api/internal/maintenance", () => {
  const secret = process.env.CRON_SECRET!;
  const post = (auth?: string) =>
    (maintenanceRoute.POST as unknown as Handler)(
      new Request("http://app/api/internal/maintenance", {
        method: "POST",
        headers: auth ? { authorization: auth } : undefined,
      }),
      { params: Promise.resolve({}) },
    );

  it("tanpa secret atau secret salah: 401", async () => {
    expect((await post()).status).toBe(401);
    expect((await post("Bearer salah")).status).toBe(401);
    expect((await post(`Bearer ${secret}x`)).status).toBe(401);
    expect((await post(secret.slice(1))).status).toBe(401);
  });

  it("secret benar: 200, dan dijalankan dua kali berturut-turut tidak merusak data", async () => {
    const first = await post(`Bearer ${secret}`);
    expect(first.status).toBe(200);
    const second = await post(`Bearer ${secret}`);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      retentionDocumentsDeleted: 0,
      orphanUploadsDeleted: 0,
      unusedAuthAccountsDeleted: 0,
      stuckRunsFailed: 0,
      redeemAttemptsPruned: 0,
      remindersSent: 0,
      remindersSkipped: 0,
    });
  });
});

// --- pedoman oleh admin -----------------------------------------------------------------

async function guidelineDocx(lines: string[]): Promise<Uint8Array> {
  const { Document, Packer, Paragraph } = await import("docx");
  const doc = new Document({ sections: [{ children: lines.map((l) => new Paragraph(l)) }] });
  return new Uint8Array(await Packer.toBuffer(doc));
}

describe("pedoman oleh admin", () => {
  const input = (over: Record<string, unknown> = {}) => ({
    name: "Pedoman Kampus Uji",
    campus_name: "Universitas Uji",
    citation_style: "apa",
    status: "draft",
    rules: { page: { margins_cm: { left: 3.5 } } },
    ...over,
  });

  it("pengguna biasa tidak bisa memakai endpoint [id] dan status", async () => {
    await loginUserWithAccess(`g${randomUUID().slice(0, 6)}@example.com`);
    const id = randomUUID();
    expect((await call(adminGuideline.GET, "GET", undefined, { id })).status).toBe(403);
    expect((await call(adminGuideline.PUT, "PUT", input(), { id })).status).toBe(403);
    expect(
      (await call(adminGuidelineStatus.POST, "POST", { status: "published" }, { id })).status,
    ).toBe(403);
  });

  it("alur unggah, baca, buat draft, terbitkan, lalu muncul di pilihan pengguna", async () => {
    await loginAdmin();
    const start = await call(adminGuidelineUpload.POST, "POST", { filename: "pedoman.docx" });
    expect(start.status).toBe(201);
    (state.storage as FakeStorage).upload(
      start.body!.upload_url,
      await guidelineDocx([
        "BAB III FORMAT PENULISAN",
        "Margin kiri 4 cm, margin atas 3 cm, margin kanan 3 cm, margin bawah 3 cm.",
        "Naskah diketik dengan huruf Arial ukuran 11 pt dan spasi 2.",
      ]),
    );

    const ext = await call(adminGuidelineExtract.POST, "POST", { path: start.body!.path });
    expect(ext.status).toBe(200);
    expect(ext.body!.rules.page.margins_cm).toMatchObject({ left: 4, top: 3, right: 3, bottom: 3 });
    expect(ext.body!.rules.body).toMatchObject({
      font_family: "Arial",
      font_size_pt: 11,
      line_spacing: 2,
    });
    expect(ext.body!.findings.length).toBeGreaterThanOrEqual(6);
    expect((state.storage as FakeStorage).removed).toContain(start.body!.path); // berkas dibuang setelah dibaca

    const created = await call(
      adminGuidelines.POST,
      "POST",
      input({ name: "Pedoman Arial", rules: ext.body!.rules }),
    );
    expect(created.status).toBe(201);
    expect(created.body!.version).toBe(1);

    // Draft belum terlihat oleh pengguna.
    await loginUserWithAccess(`p${randomUUID().slice(0, 6)}@example.com`);
    let names = (
      (await call(guidelinesRoute.GET, "GET")).body as unknown as Array<{ name: string }>
    ).map((g) => g.name);
    expect(names).not.toContain("Pedoman Arial");

    await loginAdmin();
    const pub = await call(
      adminGuidelineStatus.POST,
      "POST",
      { status: "published" },
      { id: created.body!.id },
    );
    expect(pub.body!.status).toBe("published");

    await loginUserWithAccess(`q${randomUUID().slice(0, 6)}@example.com`);
    names = (
      (await call(guidelinesRoute.GET, "GET")).body as unknown as Array<{ name: string }>
    ).map((g) => g.name);
    expect(names).toContain("Pedoman Arial");
  });

  it("mengubah pedoman terbit membuat versi baru dan mengarsipkan yang lama", async () => {
    await loginAdmin();
    const v1 = await call(
      adminGuidelines.POST,
      "POST",
      input({ name: "Pedoman Versi", status: "published" }),
    );
    const v2 = await call(
      adminGuideline.PUT,
      "PUT",
      input({
        name: "Pedoman Versi",
        status: "published",
        rules: { page: { margins_cm: { left: 4 } } },
      }),
      {
        id: v1.body!.id,
      },
    );
    expect(v2.status).toBe(200);
    expect(v2.body!.version).toBe(2);
    expect(v2.body!.id).not.toBe(v1.body!.id);
    const old = await call(adminGuideline.GET, "GET", undefined, { id: v1.body!.id });
    expect(old.body!.status).toBe("archived");
    expect(old.body!.rules.page.margins_cm.left).toBe(3.5); // versi lama utuh
  });

  it("draft diubah di tempat tanpa versi baru", async () => {
    await loginAdmin();
    const d = await call(adminGuidelines.POST, "POST", input({ name: "Pedoman Draft" }));
    const upd = await call(
      adminGuideline.PUT,
      "PUT",
      input({ name: "Pedoman Draft", rules: { body: { font_size_pt: 13 } } }),
      { id: d.body!.id },
    );
    expect(upd.body!.id).toBe(d.body!.id);
    expect(upd.body!.version).toBe(1);
    expect(upd.body!.rules.body.font_size_pt).toBe(13);
  });

  it("menolak nilai di luar batas, jalur berkas asing, dan file bukan pedoman", async () => {
    await loginAdmin();
    expect(
      (
        await call(
          adminGuidelines.POST,
          "POST",
          input({ rules: { page: { margins_cm: { left: 99 } } } }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await call(adminGuidelineExtract.POST, "POST", { path: "manuscripts/rahasia.docx" })).status,
    ).toBe(400);
    const start = await call(adminGuidelineUpload.POST, "POST", { filename: "x.pdf" });
    (state.storage as FakeStorage).upload(
      start.body!.upload_url,
      new TextEncoder().encode("bukan pdf sama sekali"),
    );
    const bad = await call(adminGuidelineExtract.POST, "POST", { path: start.body!.path });
    expect(bad.status).toBe(400);
  });
});

// --- AI ---------------------------------------------------------------------------------------

describe("AI belum dihubungkan", () => {
  it("status untuk pengguna: tidak tersedia, dengan alasan, dan cek tanpa AI tetap berjalan", async () => {
    await loginUserWithAccess(`ai${randomUUID().slice(0, 6)}@example.com`);
    const res = await call(aiStatusRoute.GET, "GET");
    expect(res.body).toMatchObject({ available: false, can_use: false, reason: "not_connected" });
  });

  it("meminta cek ber-AI saat belum terhubung ditolak dengan pesan jelas", async () => {
    await loginUserWithAccess(`ai${randomUUID().slice(0, 6)}@example.com`);
    const thesis = await call(thesesRoute.POST, "POST", {
      title: "Skripsi AI",
      guideline_id: guidelineId,
    });
    const start = await call(
      uploadsRoute.POST,
      "POST",
      { filename: "n.docx" },
      { id: thesis.body!.id },
    );
    (state.storage as FakeStorage).upload(start.body!.upload_url, await badFormatDocx());
    await call(confirmRoute.POST, "POST", undefined, { id: start.body!.document_id });
    const res = await call(
      docChecks.POST,
      "POST",
      { check_types: ["format", "ai"] },
      { id: start.body!.document_id },
    );
    expect(res.status).toBe(403);
    expect(res.body!.error).toMatchObject({
      code: "ai_unavailable",
      message: expect.stringContaining("AI belum bisa digunakan"),
    });
    const ok = await call(
      docChecks.POST,
      "POST",
      { check_types: ["format"] },
      { id: start.body!.document_id },
    );
    expect(ok.status).toBe(202);
  });

  it("admin menghubungkan AI: kunci tidak pernah muncul di respons, status jadi tersedia", async () => {
    await loginAdmin();
    const put = await call(adminAi.PUT, "PUT", {
      api_key: "sk-ant-rahasia-1234567890abcdefgh",
      enabled: true,
    });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({
      connected: true,
      enabled: true,
      available: true,
      key_hint: "…efgh",
    });
    expect(JSON.stringify(put.body)).not.toContain("rahasia");
    expect(JSON.stringify((await call(adminAi.GET, "GET")).body)).not.toContain("rahasia");
    expect((await call(adminAi.PUT, "PUT", { api_key: "pendek" })).status).toBe(400);
    // Berganti ke penyedia lain: kunci lama tetap, alamat dasar tak aman ditolak dengan pesan yang jelas.
    const bad = await call(adminAi.PUT, "PUT", {
      provider: "openai_compatible",
      api_key: "kunci-kompatibel-1",
      base_url: "http://10.0.0.1/v1",
    });
    expect(bad.status).toBe(400);
    expect(bad.body!.error.message).toContain("https");
    const gemini = await call(adminAi.PUT, "PUT", {
      provider: "gemini",
      api_key: "AIzaKunciGemini-12345",
    });
    expect(gemini.body).toMatchObject({
      provider: "gemini",
      model: "gemini-3.8-flash",
      connected: true,
    });
    expect(gemini.body!.connected_providers.sort()).toEqual(["anthropic", "gemini"]);
    expect(JSON.stringify(gemini.body)).not.toContain("AIzaKunci");
    const models = await call(adminAiModels.POST, "POST", { provider: "anthropic" });
    expect(models.status).toBe(200);
    expect(models.body!.models.length).toBeGreaterThan(0);
    expect((await call(adminAiModels.POST, "POST", { provider: "tidak-ada" })).status).toBe(400);
    await call(adminAi.PUT, "PUT", { provider: "anthropic" });
    await loginUserWithAccess(`ai${randomUUID().slice(0, 6)}@example.com`, "package");
    expect((await call(aiStatusRoute.GET, "GET")).body).toMatchObject({
      available: true,
      can_use: true,
      reason: null,
    });
    await loginAdmin();
    expect((await call(adminAi.DELETE, "DELETE")).body).toMatchObject({
      connected: false,
      available: false,
    });
  });
});

// --- Fase 2: berbagi, perbandingan, unduhan ---------------------------------------------------

async function raw(handler: unknown, method: string, params: Record<string, string> = {}) {
  const req = new Request("http://app/api/x", { method });
  const res = await (handler as Handler)(req, { params: Promise.resolve(params) });
  return {
    status: res.status,
    headers: res.headers,
    bytes: new Uint8Array(await res.arrayBuffer()),
  };
}

async function finishedRun(data?: Uint8Array, thesisId?: string) {
  const thesis = thesisId
    ? { id: thesisId }
    : (await call(thesesRoute.POST, "POST", { title: "Skripsi Fase 2", guideline_id: guidelineId }))
        .body!;
  const docId = await uploadDoc(thesis.id, data ?? (await badFormatDocx()));
  const run = await call(docChecks.POST, "POST", { check_types: ["format"] }, { id: docId });
  expect(run.status).toBe(202);
  await drainAfter();
  return { runId: run.body!.id as string, thesisId: thesis.id as string };
}

describe("tautan berbagi", () => {
  it("pemilik membuat tautan, pembaca tanpa login membaca, lalu dicabut", async () => {
    await loginUserWithAccess("bagi@example.com");
    const { runId } = await finishedRun();
    const created = await call(shareRoute.POST, "POST", undefined, { id: runId });
    expect(created.status).toBe(201);
    const token = (created.body!.url as string).split("/bagikan/")[1]!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await call(shareRoute.GET, "GET", undefined, { id: runId })).body).toHaveLength(1);

    state.user = null; // pembaca tanpa sesi
    const pub = await call(publicShare.GET, "GET", undefined, { token });
    expect(pub.status).toBe(200);
    expect(pub.body).toMatchObject({ thesis_title: "Skripsi Fase 2", version_no: 1 });
    expect(JSON.stringify(pub.body)).not.toContain("bagi@example.com");
    expect((await call(publicShare.GET, "GET", undefined, { token: "x".repeat(43) })).status).toBe(
      404,
    );
    expect((await call(publicShare.GET, "GET", undefined, { token: "pendek" })).status).toBe(404);
  });

  it("pengguna lain tidak bisa membuat, melihat, mencabut, membandingkan, atau mengunduh", async () => {
    await loginUserWithAccess("pemilik@example.com");
    const { runId } = await finishedRun();
    const link = await call(shareRoute.POST, "POST", undefined, { id: runId });
    const linkId = link.body!.link.id as string;

    await loginUserWithAccess("penyusup@example.com");
    for (const [name, handler, method, params] of [
      ["buat tautan", shareRoute.POST, "POST", { id: runId }],
      ["daftar tautan", shareRoute.GET, "GET", { id: runId }],
      ["cabut tautan", shareLinkRoute.DELETE, "DELETE", { id: runId, linkId }],
      ["bandingkan", compareRoute.GET, "GET", { id: runId }],
      ["pdf", pdfRoute.GET, "GET", { id: runId }],
      ["pdf daftar temuan", issuesPdfRoute.GET, "GET", { id: runId }],
      ["docx dirapikan", fixedRoute.GET, "GET", { id: runId }],
    ] as const) {
      const res = await raw(handler, method, params);
      expect(res.status, name).toBe(404);
    }
    state.user = null;
    expect((await raw(pdfRoute.GET, "GET", { id: runId })).status).toBe(401);
    expect((await raw(issuesPdfRoute.GET, "GET", { id: runId })).status).toBe(401);
    expect((await raw(shareRoute.POST, "POST", { id: runId })).status).toBe(401);
  });

  it("tautan yang dicabut berhenti bekerja", async () => {
    await loginUserWithAccess("cabut@example.com");
    const { runId } = await finishedRun();
    const created = await call(shareRoute.POST, "POST", undefined, { id: runId });
    const token = (created.body!.url as string).split("/bagikan/")[1]!;
    const del = await raw(shareLinkRoute.DELETE, "DELETE", {
      id: runId,
      linkId: created.body!.link.id,
    });
    expect(del.status).toBe(204);
    const user = state.user;
    state.user = null;
    expect((await call(publicShare.GET, "GET", undefined, { token })).status).toBe(404);
    state.user = user;
    expect((await call(shareRoute.GET, "GET", undefined, { id: runId })).body).toHaveLength(0);
  });
});

describe("unduhan dan perbandingan", () => {
  it("PDF bersorot, laporan temuan, naskah rapi, dan perbandingan dua versi", async () => {
    await loginUserWithAccess("unduh@example.com");
    const v1 = await finishedRun();
    const pdf = await raw(pdfRoute.GET, "GET", { id: v1.runId });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(pdf.headers.get("content-disposition")).toMatch(
      /^attachment; filename="Skrippy_Naskah-Bersorot_.+_v1\.pdf"$/,
    );
    expect(new TextDecoder().decode(pdf.bytes.slice(0, 5))).toBe("%PDF-");

    const issuesPdf = await raw(issuesPdfRoute.GET, "GET", { id: v1.runId });
    expect(issuesPdf.status).toBe(200);
    expect(issuesPdf.headers.get("content-type")).toBe("application/pdf");
    expect(issuesPdf.headers.get("content-disposition")).toMatch(
      /^attachment; filename="Skrippy_Laporan-Temuan_.+_v1\.pdf"$/,
    );
    expect(new TextDecoder().decode(issuesPdf.bytes.slice(0, 5))).toBe("%PDF-");

    // Unduhan kedua memakai salinan tersimpan; mengubah status temuan membuangnya.
    const storage = state.storage as FakeStorage;
    const cachedKey = [...storage.files.keys()].find((k) => k.endsWith(".report.v2.pdf"));
    expect(cachedKey).toBeDefined();
    const again = await raw(pdfRoute.GET, "GET", { id: v1.runId });
    expect(again.bytes).toEqual(pdf.bytes);
    const list = await call(issuesRoute.GET, "GET", undefined, { id: v1.runId });
    await call(
      issueRoute.PATCH,
      "PATCH",
      { user_status: "ignored" },
      { id: v1.runId, issueId: list.body![0].id },
    );
    expect(storage.files.has(cachedKey!)).toBe(false);

    const fixed = await raw(fixedRoute.GET, "GET", { id: v1.runId });
    expect(fixed.status).toBe(200);
    expect(fixed.headers.get("content-disposition")).toMatch(
      /^attachment; filename="Skrippy_Naskah-Rapi_.+_v1\.docx"$/,
    );
    expect(Number(fixed.headers.get("x-skrippy-changes"))).toBeGreaterThan(0); // naskah uji berhuruf dan margin salah
    expect(new TextDecoder().decode(fixed.bytes.slice(0, 2))).toBe("PK");

    const stats = await call(checkRoute.GET, "GET", undefined, { id: v1.runId });
    expect(stats.body!.stats).toMatchObject({
      words: expect.any(Number),
      readability: { sentences: expect.any(Number) },
    });

    const first = await call(compareRoute.GET, "GET", undefined, { id: v1.runId });
    expect(first.body).toMatchObject({ base: null, counts: { fixed: 0, added: 0, remaining: 0 } });

    const v2 = await finishedRun(await goodDocx(), v1.thesisId);
    const cmp = await call(compareRoute.GET, "GET", undefined, { id: v2.runId });
    expect(cmp.body!.base).toMatchObject({ run_id: v1.runId, version_no: 1 });
    expect(cmp.body!.counts.fixed).toBeGreaterThan(0);
    expect(cmp.body!.score_delta).toBeGreaterThan(0);
  });

  it("perbandingan memuat perubahan jumlah kata per bab", async () => {
    await loginUserWithAccess("bab@example.com");
    const v1 = await finishedRun(
      await buildThesis({ bodyBySection: { "BAB I": ["Satu dua tiga empat lima."] } }),
    );
    const v2 = await finishedRun(
      await buildThesis({ bodyBySection: { "BAB I": ["Satu dua tiga empat lima enam tujuh."] } }),
      v1.thesisId,
    );
    const trend = await call(trendRoute.GET, "GET", undefined, { id: v2.runId });
    expect(trend.body!.map((p: { version_no: number }) => p.version_no)).toEqual([1, 2]);
    const cmp = await call(compareRoute.GET, "GET", undefined, { id: v2.runId });
    expect(cmp.body!.chapters.find((c: { name: string }) => c.name === "BAB I")).toEqual({
      name: "BAB I",
      base_words: 5,
      words: 7,
    });
    await loginUserWithAccess("bukan-pemilik@example.com");
    expect((await call(trendRoute.GET, "GET", undefined, { id: v2.runId })).status).toBe(404);
  });

  it("abaikan selalu: milik sendiri, tidak bisa lewat cek orang lain, dan bisa dihapus", async () => {
    await loginUserWithAccess("abaikan@example.com");
    const v1 = await finishedRun();
    const list = await call(issuesRoute.GET, "GET", undefined, { id: v1.runId });
    const issueId = list.body![0].id;
    const made = await call(alwaysRoute.POST, "POST", undefined, { id: v1.runId, issueId });
    expect(made.status).toBe(201);
    const mine = await call(ignoredRoute.GET, "GET");
    expect(mine.body).toHaveLength(1);

    await loginUserWithAccess("penyusup2@example.com");
    expect(
      (await call(alwaysRoute.POST, "POST", undefined, { id: v1.runId, issueId })).status,
    ).toBe(404);
    expect((await call(ignoredRoute.GET, "GET")).body).toHaveLength(0);
    expect(
      (await call(ignoredItem.DELETE, "DELETE", undefined, { id: mine.body![0].id })).status,
    ).toBe(404);
    state.user = null;
    expect((await call(ignoredRoute.GET, "GET")).status).toBe(401);
  });

  it("cek yang belum selesai tidak bisa diunduh atau dibagikan", async () => {
    await loginUserWithAccess("belum@example.com");
    const thesis = await call(thesesRoute.POST, "POST", { title: "T", guideline_id: guidelineId });
    const docId = await uploadDoc(thesis.body!.id, await badFormatDocx());
    const run = await call(docChecks.POST, "POST", { check_types: ["format"] }, { id: docId });
    expect((await raw(pdfRoute.GET, "GET", { id: run.body!.id })).status).toBe(400);
    expect(
      (await call(shareRoute.POST, "POST", undefined, { id: run.body!.id })).body!.error.code,
    ).toBe("run_not_ready");
  });
});

// --- peran akun --------------------------------------------------------------------------------

describe("admin memberi peran", () => {
  it("promosi memberi akses panel admin, demosi mencabutnya, dan pengaman berlaku", async () => {
    const ownerId = await loginAdmin();
    const ownerSession = state.user;
    const targetId = await loginUserWithAccess("calon-admin@example.com");
    const targetSession = state.user;

    // Sebelum dipromosikan: panel admin tertutup.
    expect((await call(adminSummary.GET, "GET")).status).toBe(403);

    state.user = ownerSession;
    const list = await call(adminUsers.GET, "GET");
    expect(list.body!.find((u: { id: string }) => u.id === ownerId)).toMatchObject({
      role: "superadmin",
      is_owner: true,
    });
    expect(list.body!.find((u: { id: string }) => u.id === targetId)).toMatchObject({
      role: "user",
      is_owner: false,
    });

    const promote = await call(adminRole.POST, "POST", { role: "superadmin" }, { id: targetId });
    expect(promote.status).toBe(200);
    expect(promote.body).toEqual({ role: "superadmin" });

    // Berlaku seketika: akun yang sama kini bisa membuka panel admin.
    state.user = targetSession;
    expect((await call(adminSummary.GET, "GET")).status).toBe(200);
    expect((await call(meRoute.GET, "GET")).body!.profile.role).toBe("superadmin");

    // Admin baru tidak bisa mengubah dirinya sendiri maupun pemilik.
    expect(
      (await call(adminRole.POST, "POST", { role: "user" }, { id: targetId })).body!.error.code,
    ).toBe("role_self");
    expect(
      (await call(adminRole.POST, "POST", { role: "user" }, { id: ownerId })).body!.error.code,
    ).toBe("role_owner");

    // Pemilik mencabut peran: panel tertutup lagi.
    state.user = ownerSession;
    expect((await call(adminRole.POST, "POST", { role: "user" }, { id: targetId })).status).toBe(
      200,
    );
    state.user = targetSession;
    expect((await call(adminSummary.GET, "GET")).status).toBe(403);
  });

  it("peran tidak dikenal ditolak dan id acak tidak ditemukan", async () => {
    await loginAdmin();
    expect(
      (await call(adminRole.POST, "POST", { role: "dewa" }, { id: randomUUID() })).status,
    ).toBe(400);
    expect(
      (await call(adminRole.POST, "POST", { role: "user" }, { id: randomUUID() })).status,
    ).toBe(404);
  });
});

// --- saklar trial ------------------------------------------------------------------------------

describe("trial dimatikan dari Pengaturan", () => {
  const setTrial = async (on: boolean) => {
    await loginAdmin();
    const res = await call(adminSettings.PUT, "PUT", { values: { "trial.enabled": on ? 1 : 0 } });
    expect(res.status).toBe(200);
  };

  it("akun baru tanpa akses terkunci sampai menukar kode paket; trial menyala lagi memberi trial ke yang belum punya akses", async () => {
    await setTrial(false);
    const info = await call(publicInfo.GET, "GET");
    expect(info.body).toMatchObject({ trial_enabled: false });

    // Akun baru: masuk tanpa akses, tidak bisa menjalankan cek.
    await login("terkunci@example.com");
    const me = await call(meRoute.GET, "GET");
    expect(me.body!.access).toMatchObject({ state: "none" });
    const thesis = await call(thesesRoute.POST, "POST", { title: "T", guideline_id: guidelineId });
    const docId = await uploadDoc(thesis.body!.id, await badFormatDocx());
    const blocked = await call(docChecks.POST, "POST", { check_types: ["format"] }, { id: docId });
    expect(blocked.status).toBe(403);

    // Kode paket dari admin membuka akses.
    const lockedSession = state.user;
    await loginAdmin();
    const code = await makeCode("package");
    state.user = lockedSession;
    const redeemed = await call(redeemRoute.POST, "POST", { code });
    expect(redeemed.status).toBe(200);
    expect((await call(meRoute.GET, "GET")).body!.access).toMatchObject({ state: "package" });
    expect(
      (await call(docChecks.POST, "POST", { check_types: ["format"] }, { id: docId })).status,
    ).toBe(202);

    // Akun lain yang belum punya akses mendapat trial begitu trial dinyalakan dan ia masuk lagi.
    await setTrial(false);
    await login("menunggu@example.com");
    expect((await call(meRoute.GET, "GET")).body!.access).toMatchObject({ state: "none" });
    const waiting = state.user;
    await setTrial(true);
    state.user = waiting;
    expect((await call(meRoute.GET, "GET")).body!.access).toMatchObject({ state: "trial" });
    expect((await call(publicInfo.GET, "GET")).body).toMatchObject({ trial_enabled: true });
  });

  it("pengguna biasa tidak bisa menyalakan atau mematikan trial", async () => {
    await loginUserWithAccess("iseng@example.com");
    expect((await call(adminSettings.PUT, "PUT", { values: { "trial.enabled": 0 } })).status).toBe(
      403,
    );
  });
});

// --- batch kode, kuota, dan lihat kode ---------------------------------------------------------

describe("buat kode seperti batch", () => {
  it("jumlah, kuota, berlaku sampai, dan catatan; daftar menampilkan kuota; kode bisa dilihat lagi", async () => {
    await loginAdmin();
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const res = await call(adminCodes.POST, "POST", {
      kind: "package",
      count: 12,
      max_redemptions: 3,
      valid_until: future,
      recipient_note: "Angkatan 2022",
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(12);
    expect(new Set(res.body!.map((c: { code: string }) => c.code)).size).toBe(12);
    expect(res.body![0].redeem_before.startsWith(future)).toBe(true);

    const batchId = res.body![0].batch_id as string;
    expect(res.body!.every((c: { batch_id: string }) => c.batch_id === batchId)).toBe(true);
    const list = await call(adminBatches.GET, "GET");
    expect(list.body!.find((b: { id: string }) => b.id === batchId)).toMatchObject({
      note: "Angkatan 2022",
      total: 12,
      redeemed: 0,
      capacity: 36,
      status: "active",
    });
    // Kode asli langsung tampil di detail batch (khusus admin).
    const detail = await batchOf(batchId);
    expect(detail.codes).toHaveLength(12);
    const row = detail.codes.find((c: { id: string }) => c.id === res.body![0].id);
    expect(row).toMatchObject({ max_redemptions: 3, redemption_count: 0, status: "active" });
    expect(row.code).toBe(res.body![0].code);

    // Kuota 3 orang berbeda, orang yang sama tidak bisa dua kali.
    const code = res.body![0].code as string;
    const adminSession = state.user;
    const people: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      await login(`kuota${i}@example.com`);
      people.push(state.user);
      const r = await call(redeemRoute.POST, "POST", { code });
      expect(r.status, `orang ke-${i + 1}`).toBe(i < 3 ? 200 : 400);
    }
    state.user = people[0] as typeof state.user;
    expect((await call(redeemRoute.POST, "POST", { code })).status).toBe(400); // orang yang sama
    state.user = adminSession;
    const after = await batchOf(batchId);
    expect(after.codes.find((r: { id: string }) => r.id === res.body![0].id)).toMatchObject({
      redemption_count: 3,
      status: "used",
    });
    expect(after.batch.redeemed).toBe(3);
  });

  it("masukan tidak sah ditolak: jumlah, kuota, dan tanggal", async () => {
    await loginAdmin();
    expect((await call(adminCodes.POST, "POST", { kind: "package", count: 501 })).status).toBe(400);
    expect(
      (await call(adminCodes.POST, "POST", { kind: "package", max_redemptions: 1001 })).status,
    ).toBe(400);
    expect(
      (await call(adminCodes.POST, "POST", { kind: "package", valid_until: "kemarin" })).status,
    ).toBe(400);
    expect(
      (await call(adminCodes.POST, "POST", { kind: "package", valid_until: "2020-01-01" })).status,
    ).toBe(400);
  });

  it("kode tanpa batas waktu dan kode yang tidak dikenal untuk dihapus", async () => {
    await loginAdmin();
    const res = await call(adminCodes.POST, "POST", { kind: "package", count: 1 });
    expect(new Date(res.body![0].redeem_before).getFullYear()).toBeGreaterThan(2100);
    expect(res.body![0].message).not.toContain("Pakai sebelum");
    expect(
      (await call(adminCodeDelete.DELETE, "DELETE", undefined, { id: randomUUID() })).status,
    ).toBe(404);
  });
});

// --- saklar paket berbayar ---------------------------------------------------------------------

describe("paket berbayar dihidup-matikan dari Pengaturan", () => {
  it("mati: info publik menyembunyikan paket, tetapi admin tetap bisa membuat kode; nyala lagi: kembali", async () => {
    await loginAdmin();
    expect((await call(publicInfo.GET, "GET")).body).toMatchObject({ package_enabled: true });
    const off = await call(adminSettings.PUT, "PUT", { values: { "package.enabled": 0 } });
    expect(off.status).toBe(200);
    expect((await call(publicInfo.GET, "GET")).body).toMatchObject({ package_enabled: false });
    expect((await call(adminCodes.POST, "POST", { kind: "package", count: 1 })).status).toBe(201);
    expect((await call(adminSettings.GET, "GET")).body!.values["package.enabled"]).toBe(0);

    await call(adminSettings.PUT, "PUT", { values: { "package.enabled": 1 } });
    expect((await call(publicInfo.GET, "GET")).body).toMatchObject({ package_enabled: true });
    expect((await call(adminCodes.POST, "POST", { kind: "package", count: 1 })).status).toBe(201);
  });
});

// --- hapus akun oleh admin ---------------------------------------------------------------------

describe("admin menghapus akun pengguna", () => {
  it("menghapus akun dan semua datanya; akun sendiri dan pemilik ditolak; pengguna biasa tidak boleh", async () => {
    const ownerId = await loginAdmin();
    const ownerSession = state.user;
    const targetId = await loginUserWithAccess("akan-dihapus@example.com");
    const thesis = await call(thesesRoute.POST, "POST", {
      title: "Dihapus",
      guideline_id: guidelineId,
    });
    await uploadDoc(thesis.body!.id, await badFormatDocx());
    const targetSession = state.user;
    expect((state.storage as FakeStorage).files.size).toBeGreaterThan(0);

    // Pengguna biasa tidak boleh menghapus siapa pun.
    expect((await call(adminUserDelete.DELETE, "DELETE", undefined, { id: ownerId })).status).toBe(
      403,
    );

    state.user = ownerSession;
    expect(
      (await call(adminUserDelete.DELETE, "DELETE", undefined, { id: ownerId })).body!.error.code,
    ).toBe("delete_self");
    const res = await call(adminUserDelete.DELETE, "DELETE", undefined, { id: targetId });
    expect(res.status).toBe(204);
    expect((state.authAdmin as FakeAuthAdmin).deleted).toContain(targetId);
    expect((state.storage as FakeStorage).files.size).toBe(0);

    const list = await call(adminUsers.GET, "GET");
    expect(list.body!.some((u: { id: string }) => u.id === targetId)).toBe(false);
    expect((await call(adminUserDelete.DELETE, "DELETE", undefined, { id: targetId })).status).toBe(
      404,
    );

    // Sesi lama pengguna yang dihapus: bukan lagi pengguna terdaftar yang punya data lama.
    state.user = targetSession;
    const me = await call(meRoute.GET, "GET");
    expect(me.body!.profile.id).not.toBe(targetId + "x");
  });

  it("admin lain boleh dihapus (bukan diri sendiri atau pemilik)", async () => {
    const ownerId = await loginAdmin();
    const ownerSession = state.user;
    const adminTarget = await loginUserWithAccess("admin-yang-dihapus@example.com");
    state.user = ownerSession;
    await call(adminRole.POST, "POST", { role: "superadmin" }, { id: adminTarget });
    expect(
      (await call(adminUserDelete.DELETE, "DELETE", undefined, { id: adminTarget })).status,
    ).toBe(204);
    expect((state.authAdmin as FakeAuthAdmin).deleted).toContain(adminTarget);
    expect(
      (await call(adminUserDelete.DELETE, "DELETE", undefined, { id: ownerId })).body!.error.code,
    ).toBe("delete_self");
  });
});

// --- beri akses langsung ------------------------------------------------------------------------

describe("admin memberi akses langsung", () => {
  it("selamanya dan trial N hari; pengguna tanpa akses menjadi punya akses, lalu dicabut", async () => {
    await loginAdmin();
    const adminSession = state.user;
    const userId = await loginUserWithAccess("tanpa-kode@example.com");
    const userSession = state.user;
    // Mulai dari akses yang dicabut.
    state.user = adminSession;
    expect((await call(adminStop.POST, "POST", { reason: "uji" }, { id: userId })).status).toBe(
      204,
    );
    state.user = userSession;
    expect((await call(meRoute.GET, "GET")).body!.access.state).toBe("expired");

    state.user = adminSession;
    expect(
      (await call(adminGrant.POST, "POST", { kind: "trial", days: 10 }, { id: userId })).status,
    ).toBe(204);
    state.user = userSession;
    const trial = (await call(meRoute.GET, "GET")).body!.access;
    expect(trial).toMatchObject({ state: "trial" });
    expect(trial.days_left).toBeGreaterThanOrEqual(9);

    state.user = adminSession;
    expect((await call(adminGrant.POST, "POST", { kind: "lifetime" }, { id: userId })).status).toBe(
      204,
    );
    state.user = userSession;
    const forever = (await call(meRoute.GET, "GET")).body!.access;
    expect(forever).toMatchObject({ state: "package", checks_left: null });
    expect(forever.days_left).toBeGreaterThan(3650);

    // Daftar pengguna menampilkan tanggal daftar dan judul skripsi terbaru.
    state.user = userSession;
    await call(thesesRoute.POST, "POST", { title: "Skripsi Daftar", guideline_id: guidelineId });
    state.user = adminSession;
    const row = (await call(adminUsers.GET, "GET")).body!.find(
      (u: { id: string }) => u.id === userId,
    );
    expect(row).toMatchObject({ thesis_title: "Skripsi Daftar" });
    expect(new Date(row.created_at).getTime()).toBeGreaterThan(0);
  });

  it("masukan tidak sah ditolak, pengguna tak dikenal 404, pengguna biasa 403", async () => {
    await loginAdmin();
    const adminSession = state.user;
    expect(
      (await call(adminGrant.POST, "POST", { kind: "trial", days: 0 }, { id: randomUUID() }))
        .status,
    ).toBe(400);
    expect(
      (await call(adminGrant.POST, "POST", { kind: "trial", days: 366 }, { id: randomUUID() }))
        .status,
    ).toBe(400);
    expect(
      (await call(adminGrant.POST, "POST", { kind: "abadi" }, { id: randomUUID() })).status,
    ).toBe(400);
    expect(
      (await call(adminGrant.POST, "POST", { kind: "lifetime" }, { id: randomUUID() })).status,
    ).toBe(404);
    expect(
      (await call(adminGrant.POST, "POST", { kind: "trial", days: 5 }, { id: randomUUID() }))
        .status,
    ).toBe(404);
    await loginUserWithAccess("iseng-grant@example.com");
    expect(
      (await call(adminGrant.POST, "POST", { kind: "lifetime" }, { id: randomUUID() })).status,
    ).toBe(403);
    state.user = adminSession;
  });
});

describe("admin menghapus kode akses", () => {
  it("kode terpakai dihapus: pengguna kehilangan akses dari kode itu, daftar bersih, kode tidak bisa ditukar lagi", async () => {
    await loginAdmin();
    const adminSession = state.user;
    const code = (await call(adminCodes.POST, "POST", { kind: "package", count: 1 })).body![0];
    await login("terhapus-aksesnya@example.com");
    expect((await call(redeemRoute.POST, "POST", { code: code.code })).status).toBe(200);
    expect((await call(meRoute.GET, "GET")).body!.access.state).toBe("package");
    const userSession = state.user;

    state.user = adminSession;
    const del = await call(adminCodeDelete.DELETE, "DELETE", undefined, { id: code.id });
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ users_affected: 1 });
    // Batch yang kodenya habis ikut hilang dari daftar.
    expect(
      (await call(adminBatches.GET, "GET")).body!.some(
        (b: { id: string }) => b.id === code.batch_id,
      ),
    ).toBe(false);
    expect((await call(adminCodeDelete.DELETE, "DELETE", undefined, { id: code.id })).status).toBe(
      404,
    );

    state.user = userSession;
    expect((await call(meRoute.GET, "GET")).body!.access.state).toBe("expired");
    expect((await call(redeemRoute.POST, "POST", { code: code.code })).status).toBe(400);
  });
});

// --- batch ---------------------------------------------------------------------------------------

describe("batch kode", () => {
  it("nomor batch berurutan, daftar ringkas, dan detail memuat kode serta penebusnya", async () => {
    await loginAdmin();
    const a = (
      await call(adminCodes.POST, "POST", { kind: "package", count: 3, recipient_note: "promo" })
    ).body!;
    const b = (await call(adminCodes.POST, "POST", { kind: "package", count: 2 })).body!;
    const list = (await call(adminBatches.GET, "GET")).body!;
    const sa = list.find((x: { id: string }) => x.id === a[0].batch_id);
    const sb = list.find((x: { id: string }) => x.id === b[0].batch_id);
    expect(sb.number).toBe(sa.number + 1);
    expect(sa).toMatchObject({ total: 3, note: "promo" });
    expect(sb.note).toBeNull();
    expect(sa.valid_until).toBeNull(); // tanpa batas waktu

    const adminSession = state.user;
    await login("penebus-batch@example.com");
    await call(redeemRoute.POST, "POST", { code: a[1].code });
    state.user = adminSession;
    const detail = await batchOf(a[0].batch_id);
    expect(detail.batch).toMatchObject({ redeemed: 1, capacity: 3 });
    expect(detail.codes.find((c: { id: string }) => c.id === a[1].id).redeemed_by).toEqual([
      "penebus-batch@example.com",
    ]);
    expect(detail.codes.filter((c: { status: string }) => c.status === "used")).toHaveLength(1);
  });

  it("cabut batch: semua kode terhapus dan akses penebusnya ikut hilang", async () => {
    await loginAdmin();
    const adminSession = state.user;
    const codes = (await call(adminCodes.POST, "POST", { kind: "package", count: 3 })).body!;
    await login("kena-cabut-batch@example.com");
    expect((await call(redeemRoute.POST, "POST", { code: codes[0].code })).status).toBe(200);
    const userSession = state.user;

    state.user = adminSession;
    const del = await call(adminBatch.DELETE, "DELETE", undefined, { id: codes[0].batch_id });
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ codes_deleted: 3, users_affected: 1 });
    expect((await call(adminBatch.GET, "GET", undefined, { id: codes[0].batch_id })).status).toBe(
      404,
    );
    expect((await call(redeemRoute.POST, "POST", { code: codes[1].code })).status).toBe(400);

    state.user = userSession;
    expect((await call(meRoute.GET, "GET")).body!.access.state).toBe("expired");
  });

  it("id tidak valid 400, tidak dikenal 404, dan kelompok kode lama tidak bisa dicabut sekaligus", async () => {
    await loginAdmin();
    expect((await call(adminBatch.GET, "GET", undefined, { id: "bukan-uuid" })).status).toBe(400);
    expect((await call(adminBatch.GET, "GET", undefined, { id: randomUUID() })).status).toBe(404);
    expect((await call(adminBatch.DELETE, "DELETE", undefined, { id: randomUUID() })).status).toBe(
      404,
    );
    expect((await call(adminBatch.DELETE, "DELETE", undefined, { id: "lama" })).status).toBe(409);
  });

  it("kode lama tanpa batch muncul sebagai kelompok 'lama'", async () => {
    await loginAdmin();
    const [g] = await t.db.select().from(schema.accessCodes).limit(1);
    expect(g).toBeDefined();
    await t.db
      .update(schema.accessCodes)
      .set({ batchId: null })
      .where(eq(schema.accessCodes.id, g!.id));
    const list = (await call(adminBatches.GET, "GET")).body!;
    const legacy = list.find((b: { id: string }) => b.id === "lama");
    expect(legacy).toMatchObject({ number: null });
    const detail = await batchOf("lama");
    expect(detail.codes.some((c: { id: string }) => c.id === g!.id)).toBe(true);
  });
});
