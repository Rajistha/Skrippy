"use client";

import Link from "next/link";
import { AdminGuard } from "@/components/features/AdminGuard";
import { AppShell } from "@/components/features/AppShell";
import { ButtonLink } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { AreaChart, BarChart, Donut } from "@/components/ui/Charts";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { api, toApiError } from "@/lib/api/client";
import { formatRupiah } from "@/lib/format";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";

const nf = new Intl.NumberFormat("id-ID");

/** "2026-10-22" -> "22/10" */
const shortDate = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function ChartCard({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <h2 className="font-display text-[18px] font-semibold leading-6 text-ink-900">{title}</h2>
      <p className="mb-4 text-[13px] leading-5 text-ink-500">{hint}</p>
      {children}
    </Card>
  );
}

export default function AdminSummaryPage() {
  const s = t.admin.summary;
  const { data, error, loading, reload } = useAsync(
    async () => unwrap(await api.GET("/admin/summary"), (e) => toApiError(e).message),
    [],
  );
  const noAccess = data ? Math.max(0, data.total_users - data.active_users) : 0;
  const totalChecks30d = data
    ? data.check_status_30d.completed + data.check_status_30d.failed + data.check_status_30d.other
    : 0;

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
          <div className="flex flex-col gap-4" aria-busy="true" aria-label={t.common.loading}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[96px] rounded-xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[300px] rounded-xl" />
              ))}
            </div>
          </div>
        )}
        {data && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon="users" label={t.admin.stats.activeUsers} value={data.active_users} />
              <StatCard icon="trial" label={t.admin.stats.trials} value={data.active_trials} />
              <StatCard
                icon="package"
                label={t.admin.stats.packages}
                value={data.active_packages}
              />
              <StatCard icon="chart" label={t.admin.stats.checks} value={data.checks_last_7_days} />
            </div>

            <Card className="bg-hero grid grid-cols-2 gap-x-6 gap-y-5 p-5 text-white shadow-lg sm:p-6 lg:grid-cols-5">
              {[
                { label: s.totalUsers, value: nf.format(data.total_users), hint: s.totalUsersHint },
                { label: s.theses, value: nf.format(data.total_theses), hint: "" },
                { label: s.documents, value: nf.format(data.total_documents), hint: "" },
                {
                  label: s.avgScore,
                  value:
                    data.avg_score_30d === null
                      ? "-"
                      : String(data.avg_score_30d).replace(".", ","),
                  hint: s.avgScoreHint,
                },
                {
                  label: s.aiChecks,
                  value: nf.format(data.ai_checks_last_7_days),
                  hint: s.aiChecksHint,
                },
              ].map((f) => (
                <div key={f.label} className="min-w-0">
                  <p className="font-display text-[28px] font-bold leading-9 text-white">
                    {f.value}
                  </p>
                  <p className="text-[13px] font-semibold leading-5 text-white/90">{f.label}</p>
                  {f.hint && <p className="text-[12px] leading-4 text-white/70">{f.hint}</p>}
                </div>
              ))}
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard title={s.checksChartTitle} hint={s.checksChartHint}>
                <BarChart
                  data={data.daily.map((d) => ({
                    label: shortDate(d.date),
                    value: d.checks,
                    extra: d.failed,
                  }))}
                  valueLabel={s.checksDone}
                  extraLabel={s.checksFailed}
                />
              </ChartCard>
              <ChartCard title={s.usersChartTitle} hint={s.usersChartHint}>
                <AreaChart
                  data={data.daily.map((d) => ({ label: shortDate(d.date), value: d.new_users }))}
                  label={s.usersChartTitle}
                />
              </ChartCard>
              <ChartCard title={s.accessTitle} hint={s.accessHint}>
                <Donut
                  centerValue={nf.format(data.total_users)}
                  centerLabel={s.accessCenter}
                  slices={[
                    {
                      label: s.accessPackage,
                      value: data.active_packages,
                      className: "stroke-primary-500",
                    },
                    {
                      label: s.accessTrial,
                      value: data.active_trials,
                      className: "stroke-accent-300",
                    },
                    { label: s.accessNone, value: noAccess, className: "stroke-ink-400" },
                  ]}
                />
              </ChartCard>
              <ChartCard title={s.statusTitle} hint={s.statusHint}>
                <Donut
                  centerValue={nf.format(totalChecks30d)}
                  centerLabel={s.statusCenter}
                  slices={[
                    {
                      label: s.statusDone,
                      value: data.check_status_30d.completed,
                      className: "stroke-primary-500",
                    },
                    {
                      label: s.statusFailed,
                      value: data.check_status_30d.failed,
                      className: "stroke-sev-critical",
                    },
                    {
                      label: s.statusOther,
                      value: data.check_status_30d.other,
                      className: "stroke-ink-400",
                    },
                  ]}
                />
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard
                icon="wallet"
                label={s.revenue}
                value={formatRupiah(data.payments_this_month_idr)}
              />
              <Link
                href="/admin/sistem"
                className="flex items-center gap-4 rounded-xl bg-surface p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-50 text-[20px] text-primary-600">
                  <Icon name="server" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink-900">
                    {s.systemLink}
                  </span>
                  <span className="block text-[13px] leading-5 text-ink-500">
                    {s.systemLinkHint}
                  </span>
                </span>
                <Icon name="chevronRight" className="text-ink-400" />
              </Link>
            </div>
          </div>
        )}
      </AppShell>
    </AdminGuard>
  );
}
