import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthUser, createTestDb, type TestDb } from "@tests/helpers/test-db";
import { AI_FALLBACK_MODELS } from "@/lib/ai-providers";
import { listModels } from "../integrations/ai";
import * as aiConfig from "./ai-config";

type Seen = { url: string; headers: Record<string, string> };

function spy(status: number, payload: unknown) {
  const seen: Seen[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    seen.push({ url, headers: init.headers as Record<string, string> });
    return new Response(JSON.stringify(payload), { status });
  }) as unknown as typeof fetch;
  return { seen, impl };
}

describe("daftar model dari penyedia", () => {
  it("Anthropic: id dan nama tampilan", async () => {
    const { seen, impl } = spy(200, {
      data: [
        { id: "claude-haiku-4-5-20251001", display_name: "Claude Haiku 4.5" },
        { id: "claude-sonnet-5-5" },
        { display_name: "tanpa id" },
      ],
    });
    const models = await listModels("anthropic", { apiKey: "sk-ant", baseUrl: null }, impl);
    expect(models).toEqual([
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (claude-haiku-4-5-20251001)" },
      { id: "claude-sonnet-5-5", label: "claude-sonnet-5-5" },
    ]);
    expect(seen[0]!.url).toBe("https://api.anthropic.com/v1/models?limit=100");
    expect(seen[0]!.headers["x-api-key"]).toBe("sk-ant");
  });

  it("OpenAI: hanya model percakapan, tanpa embedding, suara, gambar, atau moderasi; terurut", async () => {
    const ids = [
      "gpt-4o",
      "text-embedding-3-small",
      "whisper-1",
      "tts-1",
      "dall-e-3",
      "gpt-4o-mini",
      "omni-moderation-latest",
      "gpt-4o-realtime-preview",
      "gpt-4o-audio-preview",
      "o3-mini",
      "gpt-4o-mini-transcribe",
      "babbage-002",
      "gpt-image-1",
    ];
    const { seen, impl } = spy(200, { data: ids.map((id) => ({ id })) });
    const models = await listModels("openai", { apiKey: "sk-x", baseUrl: null }, impl);
    expect(models.map((m) => m.id)).toEqual(["gpt-4o", "gpt-4o-mini", "o3-mini"]);
    expect(seen[0]!.url).toBe("https://api.openai.com/v1/models");
    expect(seen[0]!.headers.authorization).toBe("Bearer sk-x");
  });

  it("Gemini: hanya yang mendukung generateContent, awalan models/ dibuang, kunci di header", async () => {
    const { seen, impl } = spy(200, {
      models: [
        {
          name: "models/gemini-2.5-pro",
          displayName: "Gemini 2.5 Pro",
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/gemini-2.5-flash",
          supportedGenerationMethods: ["generateContent", "countTokens"],
        },
        { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
        { name: "models/gemini-embedding-exp", supportedGenerationMethods: ["embedContent"] },
        { name: "models/text-bison-001", supportedGenerationMethods: ["generateContent"] },
      ],
    });
    const models = await listModels("gemini", { apiKey: "AIza-x", baseUrl: null }, impl);
    expect(models.map((m) => m.id)).toEqual(["gemini-2.5-flash", "gemini-2.5-pro"]);
    expect(models[1]!.label).toBe("Gemini 2.5 Pro (gemini-2.5-pro)");
    expect(seen[0]!.url).not.toContain("AIza");
    expect(seen[0]!.headers["x-goog-api-key"]).toBe("AIza-x");
  });

  it("kompatibel OpenAI: semua id dari alamat dasar admin, terurut", async () => {
    const { seen, impl } = spy(200, {
      data: [{ id: "z-model" }, { id: "a-model" }, { id: "" }, {}],
    });
    const models = await listModels(
      "openai_compatible",
      { apiKey: "k", baseUrl: "https://openrouter.ai/api/v1/" },
      impl,
    );
    expect(models.map((m) => m.id)).toEqual(["a-model", "z-model"]);
    expect(seen[0]!.url).toBe("https://openrouter.ai/api/v1/models");
  });

  it("kunci ditolak dan penyedia mati dilaporkan sebagai AiError", async () => {
    await expect(
      listModels("openai", { apiKey: "k", baseUrl: null }, spy(401, {}).impl),
    ).rejects.toMatchObject({ code: "invalid_key" });
    await expect(
      listModels("gemini", { apiKey: "k", baseUrl: null }, spy(503, {}).impl),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("getModelList (layanan)", () => {
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

  it("tanpa kunci: daftar bawaan dengan catatan, rekomendasi di urutan pertama", async () => {
    const res = await aiConfig.getModelList(t.db, { provider: "anthropic" });
    expect(res).toMatchObject({
      source: "fallback",
      note: expect.stringContaining("Tempel kunci"),
    });
    expect(res.models).toEqual(AI_FALLBACK_MODELS.anthropic);
    expect(res.models[0]!.id).toBe("claude-haiku-4-5-20251001");
  });

  it("memakai kunci yang dikirim (belum disimpan) dan menaikkan rekomendasi ke atas", async () => {
    const { impl, seen } = spy(200, {
      data: [{ id: "gpt-4o" }, { id: "gpt-4.1" }, { id: "gpt-4o-mini" }],
    });
    const res = await aiConfig.getModelList(
      t.db,
      { provider: "openai", api_key: "sk-baru-belum-disimpan" },
      impl,
    );
    expect(res.source).toBe("provider");
    expect(res.models[0]!.id).toBe("gpt-4o-mini");
    expect(seen[0]!.headers.authorization).toBe("Bearer sk-baru-belum-disimpan");
    expect(await t.db.query.integrationSecrets.findMany()).toHaveLength(0); // tidak ada yang tersimpan
  });

  it("memakai kunci tersimpan bila tidak ada kunci di permintaan", async () => {
    await aiConfig.saveAiConfig(t.db, adminId, {
      provider: "gemini",
      api_key: "AIzaKunciTersimpan-1234",
    });
    const { impl, seen } = spy(200, {
      models: [
        { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
      ],
    });
    const res = await aiConfig.getModelList(t.db, { provider: "gemini" }, impl);
    expect(res.source).toBe("provider");
    expect(seen[0]!.headers["x-goog-api-key"]).toBe("AIzaKunciTersimpan-1234");
  });

  it("kunci ditolak, penyedia mati, atau daftar kosong: jatuh ke daftar bawaan dengan catatan, bukan galat", async () => {
    const rejected = await aiConfig.getModelList(
      t.db,
      { provider: "openai", api_key: "salah-salah" },
      spy(401, {}).impl,
    );
    expect(rejected).toMatchObject({
      source: "fallback",
      note: expect.stringContaining("ditolak"),
    });
    const down = await aiConfig.getModelList(
      t.db,
      { provider: "openai", api_key: "salah-salah" },
      spy(500, {}).impl,
    );
    expect(down).toMatchObject({
      source: "fallback",
      note: expect.stringContaining("tidak bisa dimuat"),
    });
    const empty = await aiConfig.getModelList(
      t.db,
      { provider: "openai", api_key: "kunci-kosong" },
      spy(200, { data: [] }).impl,
    );
    expect(empty).toMatchObject({
      source: "fallback",
      note: expect.stringContaining("tidak mengembalikan"),
    });
    expect(empty.models).toEqual(AI_FALLBACK_MODELS.openai);
  });

  it("kompatibel OpenAI: butuh alamat dasar yang valid dan aman", async () => {
    const none = await aiConfig.getModelList(t.db, {
      provider: "openai_compatible",
      api_key: "kunci-kompatibel",
    });
    expect(none).toMatchObject({ source: "fallback", models: [] });
    await expect(
      aiConfig.getModelList(t.db, {
        provider: "openai_compatible",
        api_key: "kunci-kompatibel",
        base_url: "http://10.0.0.5/v1",
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
    const ok = await aiConfig.getModelList(
      t.db,
      {
        provider: "openai_compatible",
        api_key: "kunci-kompatibel",
        base_url: "https://api.groq.com/openai/v1",
      },
      spy(200, { data: [{ id: "llama-3.3-70b-versatile" }] }).impl,
    );
    expect(ok).toMatchObject({ source: "provider", models: [{ id: "llama-3.3-70b-versatile" }] });
  });
});
