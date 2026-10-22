import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthUser, createTestDb, type TestDb } from "@tests/helpers/test-db";
import {
  AI_PROVIDERS,
  AiError,
  AnthropicClient,
  GeminiClient,
  OpenAiClient,
  createAiClient,
  validateBaseUrl,
} from "../integrations/ai";
import * as aiConfig from "./ai-config";

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

/** fetch palsu: mencatat permintaan dan mengembalikan jawaban yang diminta. */
function spy(status: number, payload: unknown) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string),
    });
    return new Response(JSON.stringify(payload), { status });
  }) as unknown as typeof fetch;
  return { calls, impl };
}
const ask = { system: "Sistem", user: "Pengguna", maxTokens: 123 };

describe("klien per penyedia", () => {
  it("OpenAI resmi: Bearer, chat/completions, max_completion_tokens, tanpa temperature", async () => {
    const { calls, impl } = spy(200, { choices: [{ message: { content: "halo" } }] });
    const text = await new OpenAiClient(
      "sk-x",
      "gpt-4o-mini",
      AI_PROVIDERS.openai.baseUrl!,
      true,
      impl,
    ).complete(ask);
    expect(text).toBe("halo");
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(calls[0]!.headers.authorization).toBe("Bearer sk-x");
    expect(calls[0]!.body).toMatchObject({
      model: "gpt-4o-mini",
      max_completion_tokens: 123,
      messages: [
        { role: "system", content: "Sistem" },
        { role: "user", content: "Pengguna" },
      ],
    });
    expect(calls[0]!.body).not.toHaveProperty("temperature");
    expect(calls[0]!.body).not.toHaveProperty("max_tokens");
  });

  it("kompatibel OpenAI: alamat dasar buatan admin (garis miring akhir dibuang), max_tokens dan temperature 0", async () => {
    const { calls, impl } = spy(200, { choices: [{ message: { content: "ok" } }] });
    await new OpenAiClient("k", "m", "https://openrouter.ai/api/v1/", false, impl).complete(ask);
    expect(calls[0]!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[0]!.body).toMatchObject({ max_tokens: 123, temperature: 0 });
  });

  it("Gemini: kunci di header, systemInstruction, dan teks dari beberapa bagian digabung", async () => {
    const { calls, impl } = spy(200, {
      candidates: [{ content: { parts: [{ text: "ha" }, { text: "lo" }] } }],
    });
    const text = await new GeminiClient("AIza-x", "gemini-2.5-flash", impl).complete(ask);
    expect(text).toBe("halo");
    expect(calls[0]!.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect(calls[0]!.url).not.toContain("AIza"); // kunci tidak masuk URL (tidak bocor ke log)
    expect(calls[0]!.headers["x-goog-api-key"]).toBe("AIza-x");
    expect(calls[0]!.body).toMatchObject({
      systemInstruction: { parts: [{ text: "Sistem" }] },
      contents: [{ role: "user", parts: [{ text: "Pengguna" }] }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0 }, // ruang tambahan untuk model berpikir
    });
  });

  it("Gemini: jawaban kosong (token habis dipakai berpikir) dilaporkan dengan alasan finishReason", async () => {
    const { impl } = spy(200, {
      candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }],
    });
    await expect(new GeminiClient("k", "m", impl).complete(ask)).rejects.toMatchObject({
      code: "bad_response",
      detail: "Jawaban kosong, finishReason: MAX_TOKENS",
    });
  });

  it("Anthropic tetap memakai x-api-key dan versi", async () => {
    const { calls, impl } = spy(200, { content: [{ type: "text", text: "ok" }] });
    await new AnthropicClient("sk-ant", "claude-haiku-4-5-20251001", impl).complete(ask);
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0]!.headers["x-api-key"]).toBe("sk-ant");
    expect(calls[0]!.headers["anthropic-version"]).toBe("2023-06-01");
  });

  it.each([
    ["openai", { choices: [{ message: { content: "ok" } }] }],
    ["gemini", { candidates: [{ content: { parts: [{ text: "ok" }] } }] }],
    ["anthropic", { content: [{ type: "text", text: "ok" }] }],
    ["openai_compatible", { choices: [{ message: { content: "ok" } }] }],
  ] as const)(
    "%s: status HTTP dipetakan sama dan jawaban kosong dianggap rusak",
    async (provider, okBody) => {
      const make = (status: number, body: unknown) =>
        createAiClient(
          provider,
          { apiKey: "k", model: "m", baseUrl: "https://api.contoh.com/v1" },
          spy(status, body).impl,
        );
      expect(await make(200, okBody).complete(ask)).toBe("ok");
      await expect(make(401, {}).complete(ask)).rejects.toMatchObject({ code: "invalid_key" });
      await expect(make(403, {}).complete(ask)).rejects.toMatchObject({ code: "invalid_key" });
      await expect(make(429, {}).complete(ask)).rejects.toMatchObject({ code: "rate_limited" });
      await expect(make(404, {}).complete(ask)).rejects.toMatchObject({ code: "invalid_request" });
      await expect(make(400, {}).complete(ask)).rejects.toMatchObject({ code: "invalid_request" });
      await expect(make(503, {}).complete(ask)).rejects.toMatchObject({ code: "unavailable" });
      await expect(make(200, {}).complete(ask)).rejects.toMatchObject({ code: "bad_response" });
    },
  );

  it("kompatibel OpenAI tanpa alamat dasar ditolak", () => {
    expect(() =>
      createAiClient("openai_compatible", { apiKey: "k", model: "m", baseUrl: null }),
    ).toThrow(AiError);
  });
});

describe("validasi alamat dasar", () => {
  it.each([
    ["https://openrouter.ai/api/v1", "https://openrouter.ai/api/v1"],
    ["  https://api.groq.com/openai/v1/  ", "https://api.groq.com/openai/v1"],
    ["https://api.deepseek.com", "https://api.deepseek.com"],
  ])("menerima %s", (raw, expected) => {
    expect(validateBaseUrl(raw)).toBe(expected);
  });

  it.each([
    "http://api.contoh.com/v1",
    "ftp://api.contoh.com",
    "bukan url",
    "https://user:pass@api.contoh.com/v1",
    "https://localhost/v1",
    "https://127.0.0.1/v1",
    "https://10.0.0.5/v1",
    "https://192.168.1.10/v1",
    "https://172.20.0.1/v1",
    "https://169.254.169.254/latest",
    "https://[::1]/v1",
    "https://intranet/v1",
    "https://server.internal/v1",
    "https://printer.local/v1",
  ])("menolak %s", (raw) => {
    expect(() => validateBaseUrl(raw)).toThrow(AiError);
  });
});

describe("konfigurasi banyak penyedia", () => {
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

  it("bawaan Anthropic; berganti penyedia memakai model bawaan penyedia baru dan kunci lama tetap tersimpan", async () => {
    expect(await aiConfig.getAiStatus(t.db)).toMatchObject({
      provider: "anthropic",
      connected_providers: [],
    });
    await aiConfig.saveAiConfig(t.db, adminId, {
      api_key: "sk-ant-kunci-anthropic-1234",
      enabled: true,
    });
    const toOpenAi = await aiConfig.saveAiConfig(t.db, adminId, { provider: "openai" });
    expect(toOpenAi).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      connected: false,
      available: false,
    });
    expect(toOpenAi.connected_providers).toEqual(["anthropic"]);
    expect(await aiConfig.getAiClient(t.db)).toBeNull(); // belum ada kunci OpenAI

    const withKey = await aiConfig.saveAiConfig(t.db, adminId, { api_key: "sk-openai-kunci-5678" });
    expect(withKey).toMatchObject({
      provider: "openai",
      connected: true,
      available: true,
      key_hint: "…5678",
    });
    expect([...withKey.connected_providers].sort()).toEqual(["anthropic", "openai"]);
    expect(await aiConfig.getAiClient(t.db)).toBeInstanceOf(OpenAiClient);

    const back = await aiConfig.saveAiConfig(t.db, adminId, { provider: "anthropic" });
    expect(back).toMatchObject({
      provider: "anthropic",
      connected: true,
      key_hint: "…1234",
      model: "claude-haiku-4-5-20251001",
    });
    expect(await aiConfig.getAiClient(t.db)).toBeInstanceOf(AnthropicClient);
  });

  it("Gemini dipilih dengan kunci sendiri", async () => {
    await aiConfig.saveAiConfig(t.db, adminId, {
      provider: "gemini",
      api_key: "AIzaSyKunciGemini-9999",
      enabled: true,
    });
    expect(await aiConfig.getAiClient(t.db)).toBeInstanceOf(GeminiClient);
  });

  it("kompatibel OpenAI: alamat dasar wajib, divalidasi, dan dipakai klien", async () => {
    await expect(
      aiConfig.saveAiConfig(t.db, adminId, {
        provider: "openai_compatible",
        api_key: "kunci-kompatibel-1",
      }),
    ).rejects.toMatchObject({
      code: "validation_error",
    });
    await expect(
      aiConfig.saveAiConfig(t.db, adminId, {
        provider: "openai_compatible",
        base_url: "http://insecure.example.com/v1",
        api_key: "kunci-kompatibel-1",
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
    const ok = await aiConfig.saveAiConfig(t.db, adminId, {
      provider: "openai_compatible",
      base_url: "https://openrouter.ai/api/v1/",
      model: "openai/gpt-4o-mini",
      api_key: "kunci-kompatibel-1",
      enabled: true,
    });
    expect(ok).toMatchObject({
      provider: "openai_compatible",
      base_url: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      available: true,
    });
    expect(await aiConfig.getAiClient(t.db)).toBeInstanceOf(OpenAiClient);
  });

  it("kompatibel OpenAI tanpa model: tidak ada klien (tidak menebak model)", async () => {
    await aiConfig.saveAiConfig(t.db, adminId, { model: "" });
    expect(await aiConfig.getAiClient(t.db)).toBeNull();
    await aiConfig.saveAiConfig(t.db, adminId, { model: "m" });
  });

  it("memutus sambungan hanya menghapus kunci penyedia aktif", async () => {
    await aiConfig.saveAiConfig(t.db, adminId, { provider: "gemini" });
    const after = await aiConfig.disconnectAi(t.db, adminId);
    expect(after).toMatchObject({ provider: "gemini", connected: false, enabled: false });
    expect(after.connected_providers).not.toContain("gemini");
    expect(after.connected_providers.length).toBeGreaterThanOrEqual(2);
  });
});
