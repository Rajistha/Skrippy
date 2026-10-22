"use client";

import { AdminGuard } from "@/components/features/AdminGuard";
import { AppShell } from "@/components/features/AppShell";
import { ButtonLink } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { api, toApiError } from "@/lib/api/client";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";

export default function AdminSummaryPage() {
  const { data, error, loading, reload } = useAsync(
    async () => unwrap(await api.GET("/admin/summary"), (e) => toApiError(e).message),
    [],
  );
  return (
    <AdminGuard>
      <AppShell
        title={t.nav.adminSummary}
        description={t.pageDesc.adminSummary}
        actions={
          <>
            <ButtonLink href="/admin/kode">
              <Icon name="code" /> {t.admin.createCode}
            </ButtonLink>
            <ButtonLink href="/admin/pedoman/baru" variant="outline">
              <Icon name="book" /> {t.guidelines.add}
            </ButtonLink>
          </>
        }
      >
        {error && <ErrorState message={error} onRetry={() => void reload()} />}
        {loading && !data && (
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-busy="true"
            aria-label={t.common.loading}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[96px] rounded-xl" />
            ))}
          </div>
        )}
        {data && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard icon="users" label={t.admin.stats.activeUsers} value={data.active_users} />
            <StatCard icon="trial" label={t.admin.stats.trials} value={data.active_trials} />
            <StatCard icon="package" label={t.admin.stats.packages} value={data.active_packages} />
            <StatCard icon="chart" label={t.admin.stats.checks} value={data.checks_last_7_days} />
          </div>
        )}
      </AppShell>
    </AdminGuard>
  );
}
