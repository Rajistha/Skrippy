import "server-only";
import { eq } from "drizzle-orm";
import type { Db, Executor } from "../db";
import { schema } from "../db";
import { getEnv } from "../env";
import { AppError } from "../errors";
import {
  AI_PROVIDERS,
  AiError,
  createAiClient,
  listModels,
  isProviderId,
  validateBaseUrl,
  type AiClient,
  type AiProviderId,
} from "../integrations/ai";
import { AI_FALLBACK_MODELS, type AiModelOption } from "@/lib/ai-providers";
import { decryptSecret, encryptSecret, secretHint } from "../integrations/secrets";
import { getAppSettings, updateSettings, writeAudit } from "./access";

const { integrationSecrets } = schema;

export type AiStatus = {
  /** Penyedia yang sedang dipakai. */
  provider: AiProviderId;
  /** Kunci untuk penyedia aktif tersimpan. */
  connected: boolean;
  /** Admin menyalakan fitur AI. */
  enabled: boolean;
  /** Bisa dipakai pengguna: terhubung dan menyala. */
  available: boolean;
  model: string;
  /** Hanya untuk penyedia kompatibel OpenAI. */
  base_url: string;
  key_hint: string | null;
  /** Semua penyedia yang kuncinya sudah tersimpan (kunci tidak hilang saat berganti penyedia). */
  connected_providers: AiProviderId[];
  daily_limit: number;
  allow_trial: boolean;
};

function activeProvider(raw: string): AiProviderId {
  return isProviderId(raw) ? raw : "anthropic";
}

export async function getAiStatus(db: Executor): Promise<AiStatus> {
  const [settings, secrets] = await Promise.all([
    getAppSettings(db),
    db
      .select({ provider: integrationSecrets.provider, hint: integrationSecrets.hint })
      .from(integrationSecrets),
  ]);
  const provider = activeProvider(settings["ai.provider"]);
  const mine = secrets.find((s) => s.provider === provider);
  const connected = Boolean(mine);
  const enabled = settings["ai.enabled"] === 1;
  return {
    provider,
    connected,
    enabled,
    available: connected && enabled,
    model: settings["ai.model"],
    base_url: settings["ai.base_url"],
    key_hint: mine?.hint ?? null,
    connected_providers: secrets.map((s) => s.provider).filter(isProviderId),
    daily_limit: settings["ai.daily_limit"],
    allow_trial: settings["ai.allow_trial"] === 1,
  };
}

/** Klien siap pakai, atau null bila AI belum dihubungkan atau dimatikan. */
export async function getAiClient(
  db: Db,
  opts: { ignoreEnabled?: boolean } = {},
): Promise<AiClient | null> {
  const settings = await getAppSettings(db);
  const provider = activeProvider(settings["ai.provider"]);
  const [secret] = await db
    .select()
    .from(integrationSecrets)
    .where(eq(integrationSecrets.provider, provider));
  if (!secret || (!opts.ignoreEnabled && settings["ai.enabled"] !== 1)) return null;
  const model = settings["ai.model"].trim() || AI_PROVIDERS[provider].defaultModel;
  if (!model) return null;
  try {
    return createAiClient(provider, {
      apiKey: decryptSecret(secret.ciphertext, getEnv().ACCESS_CODE_HMAC_SECRET),
      model,
      baseUrl: settings["ai.base_url"] || null,
    });
  } catch (e) {
    if (e instanceof AiError) return null;
    throw e;
  }
}

export type AiConfigInput = {
  provider?: AiProviderId;
  api_key?: string;
  model?: string;
  base_url?: string;
  enabled?: boolean;
  daily_limit?: number;
  allow_trial?: boolean;
};

export async function saveAiConfig(
  db: Db,
  actorId: string,
  input: AiConfigInput,
): Promise<AiStatus> {
  const current = await getAiStatus(db);
  const provider = input.provider ?? current.provider;
  const changes: Record<string, string | number> = {};

  if (input.provider && input.provider !== current.provider) {
    changes["ai.provider"] = provider;
    // Berganti penyedia: model lama tidak berlaku. Pakai bawaan penyedia baru bila admin tidak mengisi model.
    if (input.model === undefined) changes["ai.model"] = AI_PROVIDERS[provider].defaultModel;
  }
  if (input.model !== undefined) changes["ai.model"] = input.model.trim();
  if (provider === "openai_compatible") {
    const baseUrl = input.base_url ?? current.base_url;
    if (!baseUrl)
      throw new AppError(
        "Isi alamat dasar untuk penyedia kompatibel OpenAI.",
        "validation_error",
        400,
      );
    try {
      changes["ai.base_url"] = validateBaseUrl(baseUrl);
    } catch (e) {
      // Pesan AiError dari validateBaseUrl sudah ditulis untuk admin.
      if (e instanceof AiError) throw new AppError(e.message, "validation_error", 400);
      throw e;
    }
  }
  if (input.enabled !== undefined) changes["ai.enabled"] = input.enabled ? 1 : 0;
  if (input.daily_limit !== undefined) changes["ai.daily_limit"] = input.daily_limit;
  if (input.allow_trial !== undefined) changes["ai.allow_trial"] = input.allow_trial ? 1 : 0;

  if (input.api_key) {
    const key = input.api_key.trim();
    const secret = getEnv().ACCESS_CODE_HMAC_SECRET;
    await db
      .insert(integrationSecrets)
      .values({
        provider,
        ciphertext: encryptSecret(key, secret),
        hint: secretHint(key),
        updatedBy: actorId,
      })
      .onConflictDoUpdate({
        target: integrationSecrets.provider,
        set: {
          ciphertext: encryptSecret(key, secret),
          hint: secretHint(key),
          updatedBy: actorId,
          updatedAt: new Date(),
        },
      });
    await writeAudit(db, actorId, "ai.key_set", "integration_secrets", null, { provider });
  }
  if (Object.keys(changes).length > 0) await updateSettings(db, actorId, changes);
  return getAiStatus(db);
}

/** Hapus kunci penyedia aktif dan matikan AI. Kunci penyedia lain tetap tersimpan. */
export async function disconnectAi(db: Db, actorId: string): Promise<AiStatus> {
  const { provider } = await getAiStatus(db);
  await db.delete(integrationSecrets).where(eq(integrationSecrets.provider, provider));
  await updateSettings(db, actorId, { "ai.enabled": 0 });
  await writeAudit(db, actorId, "ai.disconnect", "integration_secrets", null, { provider });
  return getAiStatus(db);
}

export type ModelList = {
  models: AiModelOption[];
  source: "provider" | "fallback";
  note: string | null;
};

const FALLBACK_NOTE = {
  nokey:
    "Tempel kunci API untuk memuat daftar model langsung dari penyedia. Sementara ini memakai daftar bawaan.",
  failed: "Daftar dari penyedia tidak bisa dimuat. Memakai daftar bawaan.",
  empty: "Penyedia tidak mengembalikan model yang cocok. Memakai daftar bawaan.",
};

/**
 * Daftar model untuk satu penyedia. Memakai kunci yang dikirim admin (belum disimpan) atau kunci tersimpan.
 * Kunci hanya dipakai untuk satu permintaan ini dan tidak disimpan atau di-log. Gagal apa pun jatuh ke daftar bawaan.
 */
export async function getModelList(
  db: Db,
  input: { provider: AiProviderId; api_key?: string; base_url?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ModelList> {
  const fallback = (note: string): ModelList => ({
    models: AI_FALLBACK_MODELS[input.provider],
    source: "fallback",
    note,
  });

  let apiKey = input.api_key?.trim() || null;
  if (!apiKey) {
    const [secret] = await db
      .select()
      .from(integrationSecrets)
      .where(eq(integrationSecrets.provider, input.provider));
    if (secret) apiKey = decryptSecret(secret.ciphertext, getEnv().ACCESS_CODE_HMAC_SECRET);
  }
  if (!apiKey) return fallback(FALLBACK_NOTE.nokey);

  let baseUrl: string | null = null;
  if (input.provider === "openai_compatible") {
    const raw = input.base_url || (await getAiStatus(db)).base_url;
    if (!raw) return fallback("Isi alamat dasar API terlebih dulu.");
    try {
      baseUrl = validateBaseUrl(raw);
    } catch (e) {
      if (e instanceof AiError) throw new AppError(e.message, "validation_error", 400);
      throw e;
    }
  }

  try {
    const models = await listModels(input.provider, { apiKey, baseUrl }, fetchImpl);
    if (models.length === 0) return fallback(FALLBACK_NOTE.empty);
    // Rekomendasi (urutan pertama daftar bawaan) naik ke atas bila ada di daftar penyedia.
    const best = AI_FALLBACK_MODELS[input.provider][0]?.id;
    const ordered = [...models].sort((a, b) => Number(b.id === best) - Number(a.id === best));
    return { models: ordered, source: "provider", note: null };
  } catch (e) {
    if (e instanceof AiError) {
      return fallback(
        e.code === "invalid_key"
          ? "Kunci API ditolak penyedia, jadi memakai daftar bawaan."
          : FALLBACK_NOTE.failed,
      );
    }
    throw e;
  }
}
