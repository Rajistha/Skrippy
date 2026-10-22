import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildThesis } from "@tests/fixtures/build-fixtures";
import { FakeStorage } from "@tests/helpers/fakes";
import { createAuthUser, createTestDb, type TestDb } from "@tests/helpers/test-db";
import { schema } from "../db";
import { CheckNotAllowed } from "../errors";
import { AiError, AnthropicClient, type AiClient } from "../integrations/ai";
import { decryptSecret, encryptSecret, secretHint } from "../integrations/secrets";
import { parseDocx } from "../checkers/parse/document";
import * as access from "./access";
import { runAiChecks } from "./ai-check";
import * as aiConfig from "./ai-config";
import * as checks from "./checks";
import * as theses from "./theses";

const NOW = new Date("2026-10-20T03:00:00Z");
const SECRET = "x".repeat(32);
const LONG =
  "Aplikasi ini sangat berguna sekali bagi para mahasiswa yang sedang menyusun skripsi mereka.";

let t: TestDb;
let storage: FakeStorage;
let guidelineId: string;
let adminId: string;

beforeAll(async () => {
  t = await createTestDb();
  const [g] = await t.db.select().from(schema.guidelines);
  guidelineId = g!.id;
  adminId = randomUUID();
  await createAuthUser(t.raw, adminId, "admin@example.com");
});
afterAll(async () => {
  await t.close();
});

/** Klien palsu: jawaban dibuat dari paragraf yang dikirim, tanpa jaringan. */
class FakeAi implements AiClient {
  calls = 0;
  constructor(private readonly behave: (call: number, user: string) => string | Error) {}
  async complete({ user }: { user: string }): Promise<string> {
    const r = this.behave(this.calls++, user);
    if (r instanceof Error) throw r;
    return r;
  }
}

const grammarAnswer = (user: string): string => {
  const m = /\[(\d+)\] ([^\n]*sangat berguna sekali[^\n]*)/.exec(user);
  return m
    ? JSON.stringify([
        {
          p: Number(m[1]),
          type: "sentence",
          excerpt: "sangat berguna sekali",
          message: "Pemborosan kata.",
          suggestion: "sangat berguna",
        },
      ])
    : "[]";
};

async function setup(kind: "trial" | "package" = "package") {
  storage = new FakeStorage();
  const userId = randomUUID();
  const email = `${userId.slice(0, 6)}@example.com`;
  await createAuthUser(t.raw, userId, email);
  const [code] = await access.createCodes(
    t.db,
    adminId,
    { kind, ...(kind === "package" ? { paymentNote: "lunas" } : {}) },
    NOW,
  );
  await access.redeemCode(t.db, { userId, email }, code!.plain, NOW);
  const [profile] = await t.db.select().from(schema.profiles).where(eq(schema.profiles.id, userId));
  const thesis = await theses.createThesis(t.db, profile!, { title: "Uji AI", guidelineId });
  const owned = await theses.getOwnedThesis(t.db, profile!, thesis.id);
  const { document, uploadUrl } = await theses.startUpload(
    t.db,
    profile!,
    owned,
    "n.docx",
    storage,
  );
  storage.upload(
    uploadUrl,
    await buildThesis({
      abstractWords: 0,
      bodyBySection: { "BAB I": [LONG], "BAB II": [`${LONG} Kedua.`] },
    }),
  );
  const doc = await theses.confirmUpload(t.db, owned, document, storage);
  return { profile: profile!, thesis: owned, doc };
}

async function connect(enabled = true) {
  await aiConfig.saveAiConfig(t.db, adminId, {
    api_key: "sk-ant-test-key-1234567890abcdef",
    enabled,
  });
}

describe("rahasia terenkripsi", () => {
  it("enkripsi bolak-balik, acak tiap kali, dan gagal bila dirusak atau kunci beda", () => {
    const a = encryptSecret("sk-ant-rahasia", SECRET);
    expect(a).not.toContain("rahasia");
    expect(encryptSecret("sk-ant-rahasia", SECRET)).not.toBe(a);
    expect(decryptSecret(a, SECRET)).toBe("sk-ant-rahasia");
    expect(() => decryptSecret(a, "y".repeat(32))).toThrow();
    const tampered = Buffer.from(a, "base64");
    tampered[tampered.length - 1]! ^= 1;
    expect(() => decryptSecret(tampered.toString("base64"), SECRET)).toThrow();
    expect(secretHint("sk-ant-abcd1234")).toBe("…1234");
  });
});

describe("konfigurasi AI oleh admin", () => {
  it("awalnya belum terhubung; kunci disimpan terenkripsi dan tidak pernah dikembalikan", async () => {
    expect(await aiConfig.getAiStatus(t.db)).toMatchObject({
      connected: false,
      enabled: false,
      available: false,
      key_hint: null,
    });
    expect(await aiConfig.getAiClient(t.db)).toBeNull();
    const status = await aiConfig.saveAiConfig(t.db, adminId, {
      api_key: "sk-ant-test-key-1234567890abcdef",
      enabled: false,
    });
    expect(status).toMatchObject({
      connected: true,
      enabled: false,
      available: false,
      key_hint: "…cdef",
    });
    expect(JSON.stringify(status)).not.toContain("sk-ant");
    const [row] = await t.db.select().from(schema.integrationSecrets);
    expect(row!.ciphertext).not.toContain("sk-ant");
    expect(await aiConfig.getAiClient(t.db)).toBeNull(); // terhubung tapi belum dinyalakan
    expect((await aiConfig.saveAiConfig(t.db, adminId, { enabled: true })).available).toBe(true);
    expect(await aiConfig.getAiClient(t.db)).toBeInstanceOf(AnthropicClient);
  });

  it("memutus sambungan menghapus kunci dan mematikan AI", async () => {
    await connect();
    const status = await aiConfig.disconnectAi(t.db, adminId);
    expect(status).toMatchObject({ connected: false, enabled: false, available: false });
    expect(await t.db.select().from(schema.integrationSecrets)).toHaveLength(0);
  });
});

describe("gerbang cek ber-AI", () => {
  it("AI belum dihubungkan: ditolak dengan ai_unavailable, cek tanpa AI tetap jalan", async () => {
    await aiConfig.disconnectAi(t.db, adminId);
    const { profile, thesis, doc } = await setup();
    await expect(
      checks.createCheckRun(t.db, profile, thesis, doc, ["format", "ai"], NOW),
    ).rejects.toMatchObject({
      code: "ai_unavailable",
    });
    const run = await checks.createCheckRun(t.db, profile, thesis, doc, ["format"], NOW);
    expect(run.checkTypes).toEqual(["format"]);
  });

  it("trial ditolak (khusus paket) kecuali diizinkan admin", async () => {
    await connect();
    const { profile, thesis, doc } = await setup("trial");
    await expect(
      checks.createCheckRun(t.db, profile, thesis, doc, ["ai"], NOW),
    ).rejects.toMatchObject({
      code: "ai_package_only",
    });
    await aiConfig.saveAiConfig(t.db, adminId, { allow_trial: true });
    const run = await checks.createCheckRun(t.db, profile, thesis, doc, ["ai"], NOW);
    expect(run.checkTypes).toEqual(["format", "structure", "spelling", "citation", "ai"]);
    await aiConfig.saveAiConfig(t.db, adminId, { allow_trial: false });
  });

  it("batas harian AI: ditolak bila habis, dan cek yang AI-nya gagal tidak dihitung", async () => {
    await connect();
    await aiConfig.saveAiConfig(t.db, adminId, { daily_limit: 2 });
    const { profile, thesis, doc } = await setup();
    const a = await checks.createCheckRun(t.db, profile, thesis, doc, ["format", "ai"], NOW);
    await checks.createCheckRun(t.db, profile, thesis, doc, ["format", "ai"], NOW);
    await expect(
      checks.createCheckRun(t.db, profile, thesis, doc, ["format", "ai"], NOW),
    ).rejects.toBeInstanceOf(CheckNotAllowed);
    await expect(
      checks.createCheckRun(t.db, profile, thesis, doc, ["format", "ai"], NOW),
    ).rejects.toMatchObject({
      code: "ai_daily_limit",
    });
    // Run pertama selesai dengan AI gagal -> tidak memakai kuota AI.
    await checks.executeCheckRun(
      t.db,
      storage,
      a.id,
      () => undefined,
      new FakeAi(() => new AiError("unavailable")),
    );
    expect(await checks.aiRunsToday(t.db, profile.id, NOW)).toBe(1);
    await aiConfig.saveAiConfig(t.db, adminId, { daily_limit: 3 });
  });
});

describe("menjalankan cek dengan AI", () => {
  it("temuan AI masuk laporan dan skor kategori ai dihitung", async () => {
    await connect();
    const { profile, thesis, doc } = await setup();
    const run = await checks.createCheckRun(t.db, profile, thesis, doc, ["spelling", "ai"], NOW);
    const ai = new FakeAi((_, user) => grammarAnswer(user));
    const done = await checks.executeCheckRun(t.db, storage, run.id, () => undefined, ai);
    expect(done).toMatchObject({ status: "completed", aiStatus: "completed" });
    expect(ai.calls).toBeGreaterThan(0);
    const aiIssues = (await checks.listIssues(t.db, done)).filter((i) => i.category === "ai");
    expect(aiIssues.length).toBeGreaterThan(0);
    expect(aiIssues[0]).toMatchObject({ ruleCode: "AI-003", excerpt: "sangat berguna sekali" });
    expect(Object.keys(done.scoreByCategory!)).toContain("ai");
  });

  it("AI gagal total: cek aturan tetap selesai, tanpa kategori ai, dengan catatan", async () => {
    await connect();
    const { profile, thesis, doc } = await setup();
    const run = await checks.createCheckRun(t.db, profile, thesis, doc, ["spelling", "ai"], NOW);
    const done = await checks.executeCheckRun(
      t.db,
      storage,
      run.id,
      () => undefined,
      new FakeAi(() => new AiError("invalid_key")),
    );
    expect(done.status).toBe("completed");
    expect(done).toMatchObject({
      aiStatus: "failed",
      aiNote: expect.stringContaining("Kunci API"),
    });
    expect(Object.keys(done.scoreByCategory!)).not.toContain("ai");
    expect((await checks.listIssues(t.db, done)).some((i) => i.category === "ai")).toBe(false);
  });

  it("tanpa klien AI (dimatikan setelah antre): ditandai gagal dengan catatan jelas", async () => {
    await connect();
    const { profile, thesis, doc } = await setup();
    const run = await checks.createCheckRun(t.db, profile, thesis, doc, ["spelling", "ai"], NOW);
    const done = await checks.executeCheckRun(t.db, storage, run.id, () => undefined, null);
    expect(done).toMatchObject({
      status: "completed",
      aiStatus: "failed",
      aiNote: expect.stringContaining("belum bisa digunakan"),
    });
  });

  it("cek tanpa AI tidak memanggil AI dan aiStatus kosong", async () => {
    const { profile, thesis, doc } = await setup();
    const run = await checks.createCheckRun(t.db, profile, thesis, doc, ["spelling"], NOW);
    const ai = new FakeAi(() => "[]");
    const done = await checks.executeCheckRun(t.db, storage, run.id, () => undefined, ai);
    expect(ai.calls).toBe(0);
    expect(done.aiStatus).toBeNull();
  });
});

describe("runAiChecks", () => {
  const manyParas = (n: number) =>
    Array.from({ length: n }, (_, i) => `${LONG} ${"kata ".repeat(300)}${i}`);
  const docOf = async (paras: string[]) =>
    parseDocx(await buildThesis({ abstractWords: 0, bodyBySection: { "BAB I": paras } }));

  it("sebagian gagal: hasil partial dengan temuan dari yang berhasil", async () => {
    const doc = await docOf(manyParas(6));
    const ai = new FakeAi((n, user) =>
      n === 1 ? new AiError("rate_limited") : grammarAnswer(user),
    );
    const res = await runAiChecks(doc, ai, { maxChars: 100_000 });
    expect(res.status).toBe("partial");
    expect(res.note).toContain("Sebagian");
    expect(res.issues.length).toBeGreaterThan(0);
  });

  it("kunci ditolak: berhenti segera, tidak menghabiskan semua panggilan", async () => {
    const doc = await docOf(manyParas(12));
    const ai = new FakeAi(() => new AiError("invalid_key"));
    const res = await runAiChecks(doc, ai, { maxChars: 100_000 });
    expect(res.status).toBe("failed");
    expect(ai.calls).toBeLessThanOrEqual(3);
  });

  it("melewati batas waktu: sisa pekerjaan dilewati dan dilaporkan sebagian", async () => {
    const doc = await docOf(manyParas(6));
    let clock = 0;
    const ai = new FakeAi((_, user) => grammarAnswer(user));
    const res = await runAiChecks(doc, ai, {
      maxChars: 100_000,
      budgetMs: 22,
      now: () => (clock += 6),
    });
    expect(res.status).toBe("partial");
  });

  it("dokumen tanpa paragraf layak: selesai tanpa memanggil AI", async () => {
    const ai = new FakeAi(() => "[]");
    const res = await runAiChecks(
      parseDocx(
        await buildThesis({
          abstractWords: 0,
          bodyBySection: { "BAB I": [], "BAB II": [], "BAB III": [], "BAB IV": [], "BAB V": [] },
        }),
      ),
      ai,
      {
        maxChars: 1000,
      },
    );
    expect(res).toMatchObject({ status: "completed", issues: [] });
    expect(ai.calls).toBe(0);
  });
});

describe("analisis AI tambahan", () => {
  it("abstrak dan kesesuaian dikirim sebagai panggilan terpisah dan temuannya diterima", async () => {
    const doc = parseDocx(
      await buildThesis({
        bodyBySection: {
          "BAB I": [
            { kind: "p", text: "Tujuan Penelitian", bold: true },
            "Menganalisis pengaruh aplikasi terhadap kualitas penulisan skripsi mahasiswa.",
          ],
        },
      }),
    );
    const ai = new FakeAi((_, user) => {
      const m = /\[(\d+)\] (\S+ \S+)/.exec(user);
      if (user.startsWith("Abstrak:") && m)
        return JSON.stringify([
          { p: Number(m[1]), excerpt: m[2], message: "Metode belum disebut." },
        ]);
      if (user.includes("## METODE")) {
        const t = /TUJUAN PENELITIAN\n\[(\d+)\] (Menganalisis pengaruh)/.exec(user);
        return JSON.stringify(
          t ? [{ p: Number(t[1]), excerpt: t[2], message: "Tidak ada hasil sepadan." }] : [],
        );
      }
      return "[]";
    });
    const res = await runAiChecks(doc, ai, { maxChars: 100_000 });
    expect(res.status).toBe("completed");
    const codes = res.issues.map((i) => i.ruleCode).sort();
    expect(codes).toEqual(["AI-006", "AI-007"]);
  });
});

describe("klien Anthropic", () => {
  const fake = (status: number, body: unknown): typeof fetch =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const call = (f: typeof fetch) =>
    new AnthropicClient("k", "m", f).complete({ system: "s", user: "u", maxTokens: 5 });

  it("memetakan status HTTP ke kode galat dan membaca teks jawaban", async () => {
    expect(await call(fake(200, { content: [{ type: "text", text: "halo" }] }))).toBe("halo");
    await expect(call(fake(401, {}))).rejects.toMatchObject({ code: "invalid_key" });
    await expect(call(fake(429, {}))).rejects.toMatchObject({ code: "rate_limited" });
    await expect(call(fake(500, {}))).rejects.toMatchObject({ code: "unavailable" });
    await expect(call(fake(200, { content: [] }))).rejects.toMatchObject({ code: "bad_response" });
    const down = (async () => {
      throw new Error("net");
    }) as unknown as typeof fetch;
    await expect(call(down)).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("alasan dari penyedia pada uji sambungan", () => {
  it("galat 400 membawa pesan penyedia, tanpa mengubah kode galat", async () => {
    const f = (async () =>
      new Response(JSON.stringify({ error: { message: "Model tidak mendukung  parameter x" } }), {
        status: 400,
      })) as unknown as typeof fetch;
    const err = await new AnthropicClient("k", "m", f)
      .complete({ system: "s", user: "u", maxTokens: 5 })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: "invalid_request",
      detail: "HTTP 400: Model tidak mendukung parameter x",
    });
  });
});

describe("antrean analisis AI", () => {
  it("dua analisis bersamaan berjalan bergiliran, dan tiap analisis memanggil AI satu per satu", async () => {
    let active = 0;
    let peak = 0;
    const slow: AiClient = {
      async complete() {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return "[]";
      },
    };
    const doc = parseDocx(await buildThesis({}));
    const [a, b] = await Promise.all([
      runAiChecks(doc, slow, { maxChars: 100_000 }),
      runAiChecks(doc, slow, { maxChars: 100_000 }),
    ]);
    expect(a.status).toBe("completed");
    expect(b.status).toBe("completed");
    expect(peak).toBe(1);
  });

  it("kegagalan satu analisis tidak menahan antrean di belakangnya", async () => {
    const broken: AiClient = {
      async complete() {
        throw new AiError("unavailable");
      },
    };
    const ok = new FakeAi(() => "[]");
    const doc = parseDocx(await buildThesis({}));
    const [bad, good] = await Promise.all([
      runAiChecks(doc, broken, { maxChars: 100_000 }),
      runAiChecks(doc, ok, { maxChars: 100_000 }),
    ]);
    expect(bad.status).toBe("failed");
    expect(good.status).toBe("completed");
  });
});

describe("waktu habis saat antre", () => {
  it("bila seluruh waktu terpakai menunggu giliran, pesannya menyebut antrean, bukan galat penyedia", async () => {
    const ai = new FakeAi(() => "[]");
    const doc = parseDocx(await buildThesis({}));
    let clock = 0;
    const res = await runAiChecks(doc, ai, {
      maxChars: 100_000,
      budgetMs: 1,
      now: () => (clock += 100),
    });
    expect(res.status).toBe("failed");
    expect(res.note).toContain("menunggu giliran");
    expect(ai.calls).toBe(0);
  });
});

describe("antrean lintas instance pada analisis AI", () => {
  it("giliran dilepas setelah selesai, juga ketika analisis gagal", async () => {
    let released = 0;
    const slot = async () => async () => {
      released++;
    };
    const doc = parseDocx(await buildThesis({}));
    await runAiChecks(doc, new FakeAi(() => "[]"), { maxChars: 100_000, slot });
    await runAiChecks(doc, new FakeAi(() => new AiError("unavailable")), {
      maxChars: 100_000,
      slot,
    });
    expect(released).toBe(2);
  });

  it("tidak kebagian giliran: gagal dengan pesan antrean dan AI tidak dipanggil", async () => {
    const ai = new FakeAi(() => "[]");
    const doc = parseDocx(await buildThesis({}));
    const res = await runAiChecks(doc, ai, { maxChars: 100_000, slot: async () => null });
    expect(res).toMatchObject({ status: "failed" });
    expect(res.note).toContain("menunggu giliran");
    expect(ai.calls).toBe(0);
  });
});
