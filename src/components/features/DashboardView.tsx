import Link from "next/link";
import { Pill } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { formatDateTimeWib } from "@/lib/format";
import { t } from "@/lib/i18n/id";
import type { Dashboard, Me } from "@/lib/schemas";
import { MiniBar, PillBars, SemiGauge, type Bar } from "./DashboardCharts";

const STATUS_TONE = {
  queued: "neutral",
  processing: "primary",
  completed: "success",
  failed: "neutral",
} as const;
const CATEGORIES = ["format", "structure", "spelling", "citation"] as const;

function StatTile({
  title,
  value,
  note,
  href,
  solid,
}: {
  title: string;
  value: string | number;
  note: string;
  href: string;
  solid?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[144px] sm:min-h-[168px] flex-col justify-between overflow-hidden rounded-xl p-4 sm:p-5 shadow-sm",
        solid ? "bg-hero text-white" : "bg-surface",
      )}
    >
      {solid && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full border border-white/15"
        />
      )}
      <div className="relative flex items-start justify-between gap-1.5 sm:gap-2">
        <h2
          className={cn(
            "text-[13px] sm:text-[16px] font-medium leading-5 sm:leading-6",
            solid ? "text-white" : "text-ink-900",
          )}
        >
          {title}
        </h2>
        <Link
          href={href}
          aria-label={title}
          className={cn(
            "grid size-8 sm:size-9 shrink-0 place-items-center rounded-full border text-[13px] sm:text-[14px] transition-colors",
            solid
              ? "border-transparent bg-white text-primary-700 hover:bg-primary-50"
              : "border-ink-200 text-ink-900 hover:bg-primary-50",
          )}
        >
          <Icon name="external" />
        </Link>
      </div>
      <div className="relative mt-2">
        <p
          className={cn(
            "font-display text-[28px] sm:text-[44px] font-bold leading-8 sm:leading-[48px]",
            solid ? "text-white" : "text-ink-900",
          )}
        >
          {value}
        </p>
        <p
          className={cn(
            "mt-1 truncate text-[12px] sm:text-[13px] leading-4 sm:leading-5",
            solid ? "text-accent-200" : "text-ink-500",
          )}
        >
          {note}
        </p>
      </div>
    </div>
  );
}

function CardTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[18px] font-medium leading-7">{children}</h2>
      {action}
    </div>
  );
}

function Onboarding({
  steps,
}: {
  steps: Array<{ title: string; body: string; cta: string; href: string; done: boolean }>;
}) {
  const doneCount = steps.filter((x) => x.done).length;
  if (doneCount === steps.length) return null;
  const current = steps.findIndex((x) => !x.done);
  const o = t.dashboard.onboarding;
  return (
    <section
      aria-labelledby="onboarding-title"
      className="rounded-xl bg-surface p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="onboarding-title" className="text-[18px] font-semibold leading-7 text-ink-900">
            {o.title}
          </h2>
          <p className="text-[14px] leading-5 text-ink-500">{o.body}</p>
        </div>
        <span className="rounded-full bg-primary-50 px-3 py-1 text-[13px] font-semibold text-primary-700">
          {o.progress(doneCount, steps.length)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={doneCount}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-label={o.progress(doneCount, steps.length)}
        className="mt-4 h-2 overflow-hidden rounded-full bg-ink-100"
      >
        <div
          className="h-full rounded-full bg-primary-500 transition-[width] duration-500"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>
      <ol className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        {steps.map((step, i) => {
          const active = i === current;
          return (
            <li
              key={step.title}
              className={cn(
                "flex flex-col gap-3 rounded-lg p-4 ring-1 transition-colors",
                step.done
                  ? "bg-primary-50/60 ring-primary-100"
                  : active
                    ? "bg-surface ring-2 ring-primary-500"
                    : "bg-surface ring-ink-100",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full text-[14px] font-bold",
                    step.done
                      ? "bg-primary-500 text-on-primary"
                      : active
                        ? "bg-primary-100 text-primary-700"
                        : "bg-ink-100 text-ink-500",
                  )}
                >
                  {step.done ? <Icon name="done" strokeWidth={3} /> : i + 1}
                </span>
                <p
                  className={cn(
                    "text-[15px] font-semibold leading-5",
                    step.done ? "text-ink-500 line-through" : "text-ink-900",
                  )}
                >
                  {step.title}
                </p>
              </div>
              <p className="text-[13px] leading-5 text-ink-500">{step.body}</p>
              {active && (
                <ButtonLink href={step.href} className="mt-auto w-full">
                  {step.cta} <Icon name="arrow" />
                </ButtonLink>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function DashboardView({ me, data }: { me: Me; data: Dashboard }) {
  const { access } = me;
  const { thesis, documents, runs } = data;
  const completed = runs.filter((r) => r.status === "completed");
  const latest = completed[0];
  const lastScore = latest?.score_total ?? null;
  const active = access.state === "trial" || access.state === "package";

  // Skor per versi: tujuh versi terbaru, urut dari yang lama ke baru.
  const recentVersions = [...documents].slice(0, 7).reverse();
  const best = Math.max(-1, ...recentVersions.map((d) => d.latest_score ?? -1));
  const bars: Bar[] = recentVersions.map((d, i) => ({
    label: t.dashboard.versionShort(d.version_no),
    value: d.latest_score,
    highlight:
      d.latest_score !== null && d.latest_score === best
        ? "best"
        : i === recentVersions.length - 1
          ? "latest"
          : undefined,
  }));

  const byCategory = latest?.score_by_category ?? null;

  const o = t.dashboard.onboarding;
  const steps = [
    { ...o.steps[0]!, href: "/profil", done: active },
    { ...o.steps[1]!, href: "/skripsi", done: Boolean(thesis) },
    {
      ...o.steps[2]!,
      href: thesis ? `/skripsi/${thesis.id}/unggah` : "/skripsi",
      done: runs.length > 0,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Onboarding steps={steps} />

      {/* Statistik */}
      <section aria-label="Ringkasan" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          solid
          title={t.dashboard.stat.lastScore}
          value={lastScore === null ? "–" : Math.round(lastScore)}
          note={lastScore === null ? t.dashboard.note.noCheck : t.dashboard.note.fromLastCheck}
          href={latest ? `/laporan/${latest.id}` : "/skripsi"}
        />
        <StatTile
          title={t.dashboard.stat.issues}
          value={latest ? latest.issue_count : "–"}
          note={
            !latest
              ? t.dashboard.note.noCheck
              : latest.issue_count === 0
                ? t.dashboard.note.noIssues
                : t.dashboard.note.needsFix
          }
          href={latest ? `/laporan/${latest.id}` : "/skripsi"}
        />
        <StatTile
          title={t.dashboard.stat.checks}
          value={runs.length}
          note={t.dashboard.note.inHistory}
          href="/riwayat"
        />
        <StatTile
          title={t.dashboard.stat.access}
          value={active ? (access.days_left ?? 0) : "–"}
          note={
            !active
              ? t.dashboard.note.redeemToStart
              : access.checks_left !== null
                ? `${t.common.days} · ${t.dashboard.note.checksLeft(access.checks_left)}`
                : `${t.common.days} · ${t.dashboard.note.unlimited}`
          }
          href="/profil"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardTitle>{t.dashboard.scoreByVersion}</CardTitle>
            {bars.length === 0 ? (
              <p className="py-10 text-center text-ink-500">{t.dashboard.noVersions}</p>
            ) : (
              <PillBars bars={bars} ariaLabel={t.dashboard.scoreByVersion} />
            )}
          </Card>
          <Card>
            <CardTitle>{t.dashboard.recent}</CardTitle>
            {runs.length === 0 ? (
              <p className="text-ink-500">{t.dashboard.noChecks}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-ink-100">
                {runs.slice(0, 4).map((run) => (
                  <li key={run.id}>
                    <Link
                      href={`/laporan/${run.id}`}
                      className="flex min-h-14 items-center justify-between gap-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-medium text-ink-900">
                          {run.check_types
                            .map((c) => t.checks[c as keyof typeof t.checks] ?? c)
                            .join(", ")}
                        </span>
                        <span className="block text-[13px] leading-5 text-ink-500">
                          {formatDateTimeWib(run.created_at)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        {run.status === "completed" && run.score_total !== null && (
                          <span className="font-display text-[18px] font-semibold text-ink-900">
                            {Math.round(run.score_total)}
                          </span>
                        )}
                        <Pill
                          tone={STATUS_TONE[run.status]}
                          icon={run.status === "completed" ? "done" : "info"}
                        >
                          {t.status[run.status]}
                        </Pill>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardTitle
              action={
                <ButtonLink href="/skripsi" variant="outline" className="min-h-9 px-4">
                  <Icon name="plus" /> {t.dashboard.newThesisShort}
                </ButtonLink>
              }
            >
              {t.dashboard.myTheses}
            </CardTitle>
            {thesis ? (
              <ul className="flex min-w-0 flex-col gap-3">
                <li className="min-w-0">
                  <Link
                    href={`/skripsi/${thesis.id}`}
                    className="group flex min-w-0 items-start gap-3"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-50 text-primary-600">
                      <Icon name="thesis" />
                    </span>
                    <span className="min-w-0">
                      <span className="block break-words text-[15px] font-medium text-ink-900 group-hover:text-primary-600">
                        {thesis.title}
                      </span>
                      <span className="block text-[13px] leading-5 text-ink-500">
                        {documents[0]
                          ? t.thesis.version(documents[0].version_no)
                          : t.thesis.noVersions}
                      </span>
                    </span>
                  </Link>
                </li>
              </ul>
            ) : (
              <p className="text-ink-500">{t.dashboard.noThesisList}</p>
            )}
          </Card>
          <Card>
            <CardTitle>{t.dashboard.scoreByCategory}</CardTitle>
            {byCategory ? (
              <>
                <SemiGauge value={lastScore} caption={t.report.score} />
                <ul className="mt-4 flex flex-col gap-2.5">
                  {CATEGORIES.filter((c) => c in byCategory).map((c) => (
                    <li
                      key={c}
                      className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-[13px]"
                    >
                      <span className="font-medium text-ink-700">
                        <Icon name={c} /> {t.checks[c]}
                      </span>
                      <span className="font-semibold text-ink-900">
                        {Math.round(byCategory[c] ?? 0)}
                      </span>
                      <span className="col-span-2">
                        <MiniBar value={byCategory[c] ?? 0} />
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-ink-500">{t.dashboard.noCategory}</p>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}
