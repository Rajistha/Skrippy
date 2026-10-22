/** Daftar penyedia AI yang didukung. Data murni, dipakai server dan formulir admin. */
export const AI_PROVIDER_IDS = ["anthropic", "openai", "gemini", "openai_compatible"] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export const AI_PROVIDER_META: Record<AiProviderId, { label: string; defaultModel: string }> = {
  anthropic: { label: "Anthropic (Claude)", defaultModel: "claude-haiku-4-5-20251001" },
  openai: { label: "OpenAI", defaultModel: "gpt-4o-mini" },
  gemini: { label: "Google Gemini", defaultModel: "gemini-3.8-flash" },
  openai_compatible: {
    label: "Kompatibel OpenAI (OpenRouter, Groq, DeepSeek, dll.)",
    defaultModel: "",
  },
};

export type AiModelOption = { id: string; label: string };

/**
 * Daftar bawaan (cadangan) bila daftar dari penyedia belum bisa dimuat, mis. kunci belum diisi.
 * Urutan pertama adalah rekomendasi: murah dan cukup untuk memeriksa tata bahasa.
 */
export const AI_FALLBACK_MODELS: Record<AiProviderId, AiModelOption[]> = {
  anthropic: [
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (hemat, direkomendasikan)" },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (lebih teliti)" },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5 (paling teliti, mahal)" },
  ],
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o mini (hemat, direkomendasikan)" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4.1", label: "GPT-4.1" },
  ],
  gemini: [{ id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (hemat, direkomendasikan)" }],
  openai_compatible: [],
};
