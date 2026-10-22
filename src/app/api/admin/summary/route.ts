import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, route } from "@/server/http";
import { summary } from "@/server/services/admin";
import type { Summary } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireAdmin();
  const s = await summary(getDb());
  const body: Summary = {
    active_users: s.activeUsers,
    active_trials: s.activeTrials,
    active_packages: s.activePackages,
    payments_this_month_idr: s.paymentsThisMonthIdr,
    checks_last_7_days: s.checksLast7Days,
  };
  return json(body);
});
