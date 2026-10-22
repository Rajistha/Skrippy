import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { getAuthAdmin } from "@/server/integrations/auth-admin";
import { getEmailClient } from "@/server/integrations/email";
import { getStorage } from "@/server/integrations/storage";
import { json, route } from "@/server/http";
import { runMaintenance } from "@/server/services/maintenance";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Perbandingan waktu-konstan; panjang berbeda tetap ditolak tanpa membocorkan panjang secret. */
function secretMatches(header: string | null, secret: string): boolean {
  const given = Buffer.from((header ?? "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  if (given.length !== expected.length) {
    timingSafeEqual(expected, expected);
    return false;
  }
  return timingSafeEqual(given, expected);
}

/** Dipanggil harian oleh GitHub Actions. Satu-satunya jalur: tidak ada metode atau autentikasi lain. */
export const POST = route(async (request: Request) => {
  const env = getEnv();
  if (!secretMatches(request.headers.get("authorization"), env.CRON_SECRET)) {
    throw new AppError("Tidak diizinkan.", "unauthorized", 401);
  }
  const report = await runMaintenance({
    db: getDb(),
    storage: getStorage(),
    authAdmin: getAuthAdmin(),
    retentionDays: env.FILE_RETENTION_DAYS,
    email: getEmailClient(),
    appBaseUrl: env.APP_BASE_URL,
  });
  return json(report);
});
