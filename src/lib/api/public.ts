import "server-only";
import { getDb } from "@/server/db/client";
import { getAppSettings } from "@/server/services/access";
import type { PublicInfo } from "@/lib/schemas";

const FALLBACK: PublicInfo = {
  package_enabled: true,
  package_name: "Paket Skripsi",
  package_price_idr: 25000,
  package_duration_days: 30,
  trial_enabled: true,
  trial_duration_days: 7,
  trial_check_limit: 3,
  whatsapp: "",
};

/** Info publik untuk landing. Gagal (misal database belum siap) -> nilai bawaan, halaman tetap tampil. */
export async function getPublicInfo(): Promise<PublicInfo> {
  try {
    // Landing tidak boleh ikut macet bila database lambat: tunggu paling lama 3 detik, lalu pakai nilai bawaan.
    const cfg = await Promise.race([
      getAppSettings(getDb()),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    return {
      package_enabled: cfg["package.enabled"] === 1,
      package_name: cfg["package.name"],
      package_price_idr: cfg["package.price_idr"],
      package_duration_days: cfg["package.duration_days"],
      trial_enabled: cfg["trial.enabled"] === 1,
      trial_duration_days: cfg["trial.duration_days"],
      trial_check_limit: cfg["trial.check_limit"],
      whatsapp: cfg["contact.whatsapp"],
    };
  } catch {
    return FALLBACK;
  }
}
