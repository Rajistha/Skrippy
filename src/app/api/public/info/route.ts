import { getDb } from "@/server/db/client";
import { json, route } from "@/server/http";
import { getAppSettings } from "@/server/services/access";
import type { PublicInfo } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = route(async () => {
  const cfg = await getAppSettings(getDb());
  const body: PublicInfo = {
    package_enabled: cfg["package.enabled"] === 1,
    package_name: cfg["package.name"],
    package_price_idr: cfg["package.price_idr"],
    package_duration_days: cfg["package.duration_days"],
    trial_enabled: cfg["trial.enabled"] === 1,
    trial_duration_days: cfg["trial.duration_days"],
    trial_check_limit: cfg["trial.check_limit"],
    whatsapp: cfg["contact.whatsapp"],
  };
  const res = json(body);
  // Data publik yang jarang berubah: cache di browser dan CDN agar tidak menembak database tiap halaman.
  res.headers.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  return res;
});
