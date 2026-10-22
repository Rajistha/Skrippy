import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z
    .string()
    .regex(
      /^postgres(ql)?:\/\//,
      "DATABASE_URL harus berupa connection string Postgres (postgresql://...)",
    ),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_STORAGE_BUCKET: z.string().default("manuscripts"),
  ACCESS_CODE_HMAC_SECRET: z.string().min(16),
  CRON_SECRET: z.string().min(16),
  SUPERADMIN_EMAIL: z.string().email(),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  FILE_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Dibaca lazy dan divalidasi sekali. Pesan error menyebut nama variabel, tidak pernah nilainya. */
export function getEnv(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const names = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Konfigurasi environment tidak valid: ${names}`);
    }
    cached = parsed.data;
  }
  return cached;
}
