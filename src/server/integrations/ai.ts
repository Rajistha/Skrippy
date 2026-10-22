import "server-only";

/**
 * Pintu tunggal ke penyedia AI (Fase 3). Hanya berkas ini yang tahu bentuk API tiap penyedia;
 * pemeriksa AI hanya memakai `AiClient`, sehingga penyedia bisa diganti tanpa menyentuh logika cek.
 * Jangan pernah me-log isi prompt atau jawaban: isinya potongan naskah.
 */

export type AiErrorCode =
  "invalid_key" | "rate_limited" | "unavailable" | "bad_response" | "invalid_request";

import {
  AI_PROVIDER_IDS,
  AI_PROVIDER_META,
  type AiModelOption,
  type AiProviderId,
} from "@/lib/ai-providers";

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message?: string,
    /** Alasan dari penyedia (tanpa isi prompt), hanya untuk uji sambungan admin. */
    readonly detail?: string,
  ) {
    super(message ?? code);
    this.name = "AiError";
  }
}

/** Ambil pesan galat dari badan jawaban penyedia: {error:{message}} atau {error:"..."}; dipotong pendek. */
async function providerReason(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } | string } | null;
    const raw = typeof body?.error === "string" ? body.error : body?.error?.message;
    return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 240) : undefined;
  } catch {
    return undefined;
  }
}

export interface AiClient {
  complete(input: { system: string; user: string; maxTokens: number }): Promise<string>;
}

export const AI_ERROR_NOTE: Record<AiErrorCode, string> = {
  invalid_key: "Kunci API AI ditolak penyedia. Hubungi pemilik.",
  rate_limited: "Layanan AI sedang sibuk. Coba lagi nanti.",
  unavailable: "Layanan AI tidak bisa dihubungi.",
  bad_response: "Layanan AI memberi jawaban yang tidak bisa dibaca.",
  invalid_request: "Model atau pengaturan penyedia AI tidak valid. Hubungi pemilik.",
};

// --- penyedia ---------------------------------------------------------------------------------

export { AI_PROVIDER_IDS, type AiProviderId };

export type AiProviderInfo = {
  id: AiProviderId;
  label: string;
  defaultModel: string;
  /** Alamat dasar tetap; null bila admin mengisinya sendiri. */
  baseUrl: string | null;
};

const BASE_URLS: Record<AiProviderId, string | null> = {
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  openai_compatible: null,
};

export const AI_PROVIDERS = Object.fromEntries(
  AI_PROVIDER_IDS.map((id) => [id, { id, ...AI_PROVIDER_META[id], baseUrl: BASE_URLS[id] }]),
) as Record<AiProviderId, AiProviderInfo>;

export const isProviderId = (v: string): v is AiProviderId =>
  (AI_PROVIDER_IDS as readonly string[]).includes(v);

/** Pemetaan status HTTP yang sama untuk semua penyedia. */
function failFor(status: number): AiError {
  if (status === 401 || status === 403) return new AiError("invalid_key");
  if (status === 429) return new AiError("rate_limited");
  if (status === 400 || status === 404 || status === 422) return new AiError("invalid_request");
  return new AiError("unavailable");
}

type Fetch = typeof fetch;

async function postJson(
  fetchImpl: Fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new AiError("unavailable");
  }
  if (!res.ok) {
    const err = failFor(res.status);
    throw new AiError(
      err.code,
      undefined,
      `HTTP ${res.status}: ${(await providerReason(res)) ?? "-"}`,
    );
  }
  return res.json().catch(() => null);
}

const stringOrThrow = (v: unknown): string => {
  if (typeof v !== "string" || v === "") throw new AiError("bad_response");
  return v;
};

export class AnthropicClient implements AiClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async complete({
    system,
    user,
    maxTokens,
  }: {
    system: string;
    user: string;
    maxTokens: number;
  }): Promise<string> {
    const data = (await postJson(
      this.fetchImpl,
      `${AI_PROVIDERS.anthropic.baseUrl}/messages`,
      { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      {
        model: this.model,
        max_tokens: maxTokens,
        temperature: 0,
        system,
        messages: [{ role: "user", content: user }],
      },
    )) as { content?: Array<{ type: string; text?: string }> } | null;
    return stringOrThrow(data?.content?.find((c) => c.type === "text")?.text);
  }
}

/** OpenAI dan semua layanan yang meniru endpoint /chat/completions. */
export class OpenAiClient implements AiClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string,
    /** OpenAI resmi memakai max_completion_tokens dan menolak temperature selain bawaan pada model baru. */
    private readonly official: boolean,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async complete({
    system,
    user,
    maxTokens,
  }: {
    system: string;
    user: string;
    maxTokens: number;
  }): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(this.official
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens, temperature: 0 }),
    };
    const data = (await postJson(
      this.fetchImpl,
      `${this.baseUrl.replace(/\/+$/, "")}/chat/completions`,
      { authorization: `Bearer ${this.apiKey}` },
      body,
    )) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
    return stringOrThrow(data?.choices?.[0]?.message?.content);
  }
}

export class GeminiClient implements AiClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async complete({
    system,
    user,
    maxTokens,
  }: {
    system: string;
    user: string;
    maxTokens: number;
  }): Promise<string> {
    const data = (await postJson(
      this.fetchImpl,
      `${AI_PROVIDERS.gemini.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`,
      { "x-goog-api-key": this.apiKey },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        // Model berpikir (Gemini 2.5 ke atas) menghabiskan sebagian batas ini untuk "berpikir" sebelum
        // menulis jawaban; tanpa ruang tambahan jawabannya bisa kosong.
        generationConfig: { maxOutputTokens: Math.max(maxTokens * 4, 2048), temperature: 0 },
      },
    )) as {
      candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
    } | null;
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? "").join("");
    if (text === "")
      throw new AiError(
        "bad_response",
        undefined,
        `Jawaban kosong, finishReason: ${data?.candidates?.[0]?.finishReason ?? "tidak ada kandidat"}`,
      );
    return text;
  }
}

export function createAiClient(
  provider: AiProviderId,
  opts: { apiKey: string; model: string; baseUrl: string | null },
  fetchImpl: Fetch = fetch,
): AiClient {
  switch (provider) {
    case "anthropic":
      return new AnthropicClient(opts.apiKey, opts.model, fetchImpl);
    case "gemini":
      return new GeminiClient(opts.apiKey, opts.model, fetchImpl);
    case "openai":
      return new OpenAiClient(
        opts.apiKey,
        opts.model,
        AI_PROVIDERS.openai.baseUrl!,
        true,
        fetchImpl,
      );
    case "openai_compatible":
      if (!opts.baseUrl) throw new AiError("invalid_request");
      return new OpenAiClient(opts.apiKey, opts.model, opts.baseUrl, false, fetchImpl);
  }
}

// --- alamat dasar buatan admin ----------------------------------------------------------------------

/**
 * Alamat dasar untuk penyedia "kompatibel OpenAI". Hanya admin yang mengisinya, tetapi server yang
 * memanggilnya, jadi tetap dibatasi: https, tanpa kredensial di URL, dan bukan alamat lokal atau jaringan privat.
 */
export function validateBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AiError("invalid_request", "Alamat dasar bukan URL yang valid.");
  }
  if (url.protocol !== "https:")
    throw new AiError("invalid_request", "Alamat dasar harus diawali https://.");
  if (url.username || url.password)
    throw new AiError(
      "invalid_request",
      "Alamat dasar tidak boleh memuat nama pengguna atau kata sandi.",
    );
  const host = url.hostname.toLowerCase();
  const privateV4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "[::1]" ||
    host.startsWith("[") ||
    privateV4.test(host) ||
    !host.includes(".")
  ) {
    throw new AiError(
      "invalid_request",
      "Alamat dasar tidak boleh menunjuk ke jaringan lokal atau privat.",
    );
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

// --- daftar model otomatis ------------------------------------------------------------------------------------

async function getJson(
  fetchImpl: Fetch,
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "GET", headers, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new AiError("unavailable");
  }
  if (!res.ok) throw failFor(res.status);
  return res.json().catch(() => null);
}

/** Model OpenAI untuk percakapan teks: buang embedding, suara, gambar, moderasi, dan sejenisnya. */
const OPENAI_CHAT = /^(gpt-|o\d|chatgpt-)/i;
const OPENAI_EXCLUDE =
  /(embedding|whisper|tts|dall-e|moderation|audio|realtime|image|transcribe|search|instruct|davinci|babbage|codex)/i;

const byId = (a: AiModelOption, b: AiModelOption): number => a.id.localeCompare(b.id);

/**
 * Daftar model yang bisa dipakai kunci ini, langsung dari penyedia. Melempar AiError bila kunci ditolak
 * atau penyedia tidak bisa dihubungi; pemanggil memakai daftar bawaan sebagai cadangan.
 */
export async function listModels(
  provider: AiProviderId,
  opts: { apiKey: string; baseUrl: string | null },
  fetchImpl: Fetch = fetch,
): Promise<AiModelOption[]> {
  switch (provider) {
    case "anthropic": {
      const data = (await getJson(fetchImpl, `${AI_PROVIDERS.anthropic.baseUrl}/models?limit=100`, {
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      })) as { data?: Array<{ id?: string; display_name?: string }> } | null;
      return (data?.data ?? [])
        .filter((m): m is { id: string; display_name?: string } => typeof m.id === "string")
        .map((m) => ({ id: m.id, label: m.display_name ? `${m.display_name} (${m.id})` : m.id }));
    }
    case "openai": {
      const data = (await getJson(fetchImpl, `${AI_PROVIDERS.openai.baseUrl}/models`, {
        authorization: `Bearer ${opts.apiKey}`,
      })) as { data?: Array<{ id?: string }> } | null;
      return (data?.data ?? [])
        .map((m) => m.id)
        .filter(
          (id): id is string =>
            typeof id === "string" && OPENAI_CHAT.test(id) && !OPENAI_EXCLUDE.test(id),
        )
        .map((id) => ({ id, label: id }))
        .sort(byId);
    }
    case "gemini": {
      const data = (await getJson(fetchImpl, `${AI_PROVIDERS.gemini.baseUrl}/models?pageSize=200`, {
        "x-goog-api-key": opts.apiKey,
      })) as {
        models?: Array<{
          name?: string;
          displayName?: string;
          supportedGenerationMethods?: string[];
        }>;
      } | null;
      return (data?.models ?? [])
        .filter(
          (m) =>
            m.supportedGenerationMethods?.includes("generateContent") &&
            /^models\/gemini-/.test(m.name ?? ""),
        )
        .map((m) => {
          const id = (m.name as string).replace(/^models\//, "");
          return { id, label: m.displayName ? `${m.displayName} (${id})` : id };
        })
        .sort(byId);
    }
    case "openai_compatible": {
      if (!opts.baseUrl) throw new AiError("invalid_request");
      const data = (await getJson(fetchImpl, `${opts.baseUrl.replace(/\/+$/, "")}/models`, {
        authorization: `Bearer ${opts.apiKey}`,
      })) as { data?: Array<{ id?: string }> } | null;
      return (data?.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => typeof id === "string" && id !== "")
        .map((id) => ({ id, label: id }))
        .sort(byId);
    }
  }
}
