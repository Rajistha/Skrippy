"use client";

import type { ReactNode } from "react";
import { AdminGuard } from "@/components/features/AdminGuard";
import { AppShell } from "@/components/features/AppShell";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/ui/Toast";
import { Meter } from "@/components/ui/Charts";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { Alert } from "@/components/ui/Alert";
import { api, toApiError } from "@/lib/api/client";
import type { OrphanScan } from "@/lib/schemas";
import { formatBytes, formatDateTimeWib } from "@/lib/format";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";

const nf = new Intl.NumberFormat("id-ID");

type Status = "ok" | "error" | "not_configured";

const STATUS_STYLE: Record<Status, { icon: IconName; tone: string }> = {
  ok: { icon: "success", tone: "bg-sev-success-bg text-sev-success" },
  error: { icon: "critical", tone: "bg-sev-critical-bg text-sev-critical" },
  not_configured: { icon: "neutral", tone: "bg-ink-100 text-ink-700" },
};

/** Status selalu ikon + teks, bukan warna saja. */
function StatusBadge({ status }: { status: Status }) {
  const style = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold leading-4 ${style.tone}`}
    >
      <Icon name={style.icon} /> {t.system.status[status]}
    </span>
  );
}

function ServiceCard({
  icon,
  title,
  subtitle,
  status,
  children,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  status: Status;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-50 text-[20px] text-primary-600">
          <Icon name={icon} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[18px] font-semibold leading-6 text-ink-900">{title}</h2>
          <p className="text-[13px] leading-5 text-ink-500">{subtitle}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      {children}
    </Card>
  );
}

function Facts({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-2 gap-3">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-lg bg-primary-50 p-3">
          <dd className="truncate font-display text-[18px] font-semibold leading-6 text-ink-900">
            {value}
          </dd>
          <dt className="text-[12px] font-semibold leading-4 text-ink-500">{label}</dt>
        </div>
      ))}
    </dl>
  );
}

function Notice({
  tone,
  title,
  body,
}: {
  tone: "neutral" | "error";
  title?: string;
  body: string;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg p-3 text-[14px] leading-5 ${
        tone === "error" ? "bg-sev-critical-bg text-sev-critical" : "bg-ink-100 text-ink-700"
      }`}
    >
      <Icon name={tone === "error" ? "critical" : "info"} className="mt-0.5 shrink-0" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <p>{body}</p>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} mnt`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} jam`;
  return `${Math.round(seconds / 86_400)} hari`;
}

const DEPLOY_TONE: Record<string, string> = {
  READY: "bg-sev-success-bg text-sev-success",
  ERROR: "bg-sev-critical-bg text-sev-critical",
  CANCELED: "bg-ink-100 text-ink-700",
};

/** Pindai dulu (hanya membaca), baru hapus setelah konfirmasi. Server memindai ulang saat menghapus. */
function OrphanCleaner() {
  const o = t.system.orphans;
  const [scan, setScan] = useState<OrphanScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function runScan() {
    setScanning(true);
    setFailed(null);
    const { data, error } = await api.GET("/admin/system/orphans");
    setScanning(false);
    if (error || !data) setFailed(error ? toApiError(error).message : o.scanFailed);
    else setScan(data);
  }

  async function clean() {
    const { data, error } = await api.POST("/admin/system/orphans");
    if (error || !data) throw new Error(toApiError(error).message);
    toast.success(o.done(data.deleted));
    setScan({ ...(scan as OrphanScan), count: 0, bytes: 0, sample: [] });
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-50 text-[20px] text-primary-600">
          <Icon name="trash" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[18px] font-semibold leading-6 text-ink-900">
            {o.title}
          </h2>
          <p className="text-[13px] leading-5 text-ink-500">{o.body}</p>
        </div>
        <Button variant="outline" loading={scanning} onClick={() => void runScan()}>
          <Icon name="search" /> {scanning ? o.scanning : o.scan}
        </Button>
      </div>
      {failed && <Alert tone="error">{failed}</Alert>}
      {!scan && !failed && <p className="text-[14px] text-ink-500">{o.neverScanned}</p>}
      {scan && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-ink-500">{o.scanned(scan.scanned)}</p>
          {scan.count === 0 ? (
            <Notice tone="neutral" title={o.noneTitle} body={o.noneBody} />
          ) : (
            <>
              <p className="text-[15px] font-semibold text-ink-900">
                {o.found(scan.count, formatBytes(scan.bytes))}
              </p>
              <div>
                <p className="mb-1 text-[12px] font-semibold text-ink-500">{o.sample}</p>
                <ul className="flex flex-col gap-1">
                  {scan.sample.map((k) => (
                    <li key={k} className="truncate font-mono text-[12px] text-ink-700">
                      {k}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <Button variant="danger" onClick={() => setConfirming(true)}>
                  <Icon name="trash" /> {o.clean}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        tone="danger"
        title={o.confirmTitle}
        description={scan ? o.confirmBody(scan.count, formatBytes(scan.bytes)) : ""}
        confirmLabel={o.confirmLabel}
        onConfirm={clean}
      />
    </Card>
  );
}

export default function AdminSystemPage() {
  const sys = t.system;
  const { data, error, loading, reload } = useAsync(
    async () => unwrap(await api.GET("/admin/system"), (e) => toApiError(e).message),
    [],
  );

  return (
    <AdminGuard>
      <AppShell
        title={t.nav.adminSystem}
        description={t.pageDesc.adminSystem}
        actions={
          <Button
            variant="outline"
            loading={loading && Boolean(data)}
            onClick={() => void reload()}
          >
            <Icon name="refresh" /> {sys.refresh}
          </Button>
        }
      >
        {error && <ErrorState message={error || sys.loadError} onRetry={() => void reload()} />}
        {loading && !data && (
          <div
            className="grid grid-cols-1 gap-4 lg:grid-cols-2"
            aria-busy="true"
            aria-label={t.common.loading}
          >
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[300px] rounded-xl" />
            ))}
          </div>
        )}
        {data && (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-ink-500">
              {sys.checkedAt(formatDateTimeWib(data.checked_at))}
            </p>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Supabase */}
              <ServiceCard
                icon="database"
                title={sys.supabase.title}
                subtitle={sys.supabase.subtitle}
                status={data.supabase.status}
              >
                {data.supabase.status === "error" ? (
                  <Notice tone="error" body={sys.supabase.down} />
                ) : (
                  <>
                    <Facts
                      items={[
                        [
                          sys.latency,
                          data.supabase.latency_ms === null
                            ? "-"
                            : sys.ms(data.supabase.latency_ms),
                        ],
                        [sys.supabase.connections, data.supabase.connections ?? "-"],
                        [
                          sys.supabase.authUsers,
                          data.supabase.auth_users === null
                            ? "-"
                            : nf.format(data.supabase.auth_users),
                        ],
                        [
                          sys.supabase.storage,
                          data.supabase.storage
                            ? `${formatBytes(data.supabase.storage.used_bytes)} (${sys.supabase.storageObjects(data.supabase.storage.objects)})`
                            : "-",
                        ],
                      ]}
                    />
                    {data.supabase.database && (
                      <Meter
                        label={sys.supabase.database}
                        used={data.supabase.database.used_bytes}
                        limit={data.supabase.database.limit_bytes}
                        format={formatBytes}
                      />
                    )}
                    {data.supabase.tables.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[320px] text-left text-[13px]">
                          <caption className="sr-only">{sys.supabase.tables}</caption>
                          <thead>
                            <tr className="text-ink-500">
                              <th className="py-2 pr-3 font-semibold">{sys.supabase.tableName}</th>
                              <th className="py-2 pr-3 text-right font-semibold">
                                {sys.supabase.tableRows}
                              </th>
                              <th className="py-2 text-right font-semibold">
                                {sys.supabase.tableSize}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.supabase.tables.map((tb) => (
                              <tr key={tb.name} className="border-t border-ink-100">
                                <td className="py-2 pr-3 font-mono text-[12px] text-ink-900">
                                  {tb.name}
                                </td>
                                <td className="py-2 pr-3 text-right tabular-nums">
                                  {nf.format(tb.rows)}
                                </td>
                                <td className="py-2 text-right tabular-nums">
                                  {formatBytes(tb.bytes)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </ServiceCard>

              {/* Cloudflare */}
              <ServiceCard
                icon="cloud"
                title={sys.cloudflare.title}
                subtitle={sys.cloudflare.subtitle}
                status={data.cloudflare.status}
              >
                {!data.cloudflare.active ? (
                  <Notice
                    tone="neutral"
                    title={sys.cloudflare.inactiveTitle}
                    body={sys.cloudflare.inactiveBody}
                  />
                ) : (
                  <>
                    {data.cloudflare.status === "error" && (
                      <Notice tone="error" body={sys.cloudflare.down} />
                    )}
                    <Facts
                      items={[
                        [
                          sys.latency,
                          data.cloudflare.latency_ms === null
                            ? "-"
                            : sys.ms(data.cloudflare.latency_ms),
                        ],
                        [sys.cloudflare.bucket, data.cloudflare.bucket ?? "-"],
                        [sys.cloudflare.files, nf.format(data.cloudflare.files)],
                      ]}
                    />
                    <Meter
                      label={sys.cloudflare.usage}
                      used={data.cloudflare.storage.used_bytes}
                      limit={data.cloudflare.storage.limit_bytes}
                      format={formatBytes}
                    />
                    <p className="text-[12px] leading-4 text-ink-500">{sys.cloudflare.note}</p>
                  </>
                )}
              </ServiceCard>
            </div>

            <OrphanCleaner />

            {/* Vercel */}
            <ServiceCard
              icon="server"
              title={sys.vercel.title}
              subtitle={sys.vercel.subtitle}
              status={data.vercel.status === "not_configured" ? "ok" : data.vercel.status}
            >
              <Facts
                items={[
                  [sys.app.environment, data.app.environment],
                  [sys.app.region, data.app.region ?? sys.app.local],
                  [sys.app.commit, data.app.commit ?? sys.app.unknown],
                  [sys.app.node, data.app.node],
                  [sys.app.uptime, formatUptime(data.app.uptime_seconds)],
                  [
                    sys.app.storage,
                    data.app.storage_provider === "r2" ? "Cloudflare R2" : "Supabase",
                  ],
                ]}
              />
              {data.vercel.status === "not_configured" && (
                <Notice
                  tone="neutral"
                  title={sys.vercel.notConnectedTitle}
                  body={sys.vercel.notConnectedBody}
                />
              )}
              {data.vercel.status === "error" && <Notice tone="error" body={sys.vercel.failed} />}
              {data.vercel.status === "ok" && (
                <div>
                  <h3 className="mb-2 text-[14px] font-semibold text-ink-900">
                    {sys.vercel.deployments}
                  </h3>
                  {data.vercel.deployments.length === 0 ? (
                    <p className="text-[14px] text-ink-500">{sys.vercel.none}</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-ink-100">
                      {data.vercel.deployments.map((d) => (
                        <li
                          key={d.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
                        >
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                              DEPLOY_TONE[d.state] ?? "bg-sev-minor-bg text-sev-minor"
                            }`}
                          >
                            {(sys.vercel.states as Record<string, string>)[d.state] ?? d.state}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[14px] text-ink-900">
                            {d.message ?? d.commit ?? d.id}
                          </span>
                          <span className="text-[12px] text-ink-500">
                            {d.target
                              ? ((sys.vercel.target as Record<string, string>)[d.target] ??
                                d.target)
                              : ""}{" "}
                            {d.commit && <span className="font-mono">{d.commit}</span>}
                          </span>
                          <span className="text-[12px] tabular-nums text-ink-500">
                            {formatDateTimeWib(d.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </ServiceCard>
          </div>
        )}
      </AppShell>
    </AdminGuard>
  );
}
