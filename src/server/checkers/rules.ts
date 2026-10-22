import defaults from "./defaults.json";
import type { Rules } from "./types";

type Json = Record<string, unknown>;

function isPlainObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function merge(base: Json, override: Json): Json {
  const out: Json = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    const current = out[key];
    out[key] =
      isPlainObject(value) && isPlainObject(current)
        ? merge(current, value)
        : structuredClone(value);
  }
  return out;
}

export function loadDefaults(): Rules {
  return structuredClone(defaults) as unknown as Rules;
}

/** Isi kunci yang tidak ada di snapshot pedoman dengan nilai default. */
export function resolveRules(snapshot?: Json | null): Rules {
  return merge(defaults as unknown as Json, snapshot ?? {}) as unknown as Rules;
}
