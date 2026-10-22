import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, route } from "@/server/http";
import { activeGrants, pickGrant } from "@/server/services/access";
import { getAiStatus } from "@/server/services/ai-config";
import { aiRunsToday } from "@/server/services/checks";
import type { AiUserStatus } from "@/lib/schemas";

export const runtime = "nodejs";

/** Status AI untuk pengguna yang sedang masuk. Dipakai halaman unggah agar opsi AI tampil jujur. */
export const GET = route(async () => {
  const user = await requireProfile();
  const db = getDb();
  const now = new Date();
  const [status, grants, used] = await Promise.all([
    getAiStatus(db),
    activeGrants(db, user.id, now),
    aiRunsToday(db, user.id, now),
  ]);
  const grant = pickGrant(grants);
  let reason: AiUserStatus["reason"] = null;
  if (!status.available) reason = "not_connected";
  else if (grant && grant.kind !== "package" && !status.allow_trial) reason = "package_only";
  else if (used >= status.daily_limit) reason = "daily_limit";
  const body: AiUserStatus = {
    available: status.available,
    can_use: reason === null,
    reason,
    used_today: used,
    daily_limit: status.daily_limit,
  };
  return json(body);
});
