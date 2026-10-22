"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/features/AppShell";
import { CompareSection } from "@/components/features/CompareSection";
import { DownloadMenu } from "@/components/features/DownloadMenu";
import { IssueCard } from "@/components/features/IssueCard";
import { RunProgress } from "@/components/features/RunProgress";
import { ScoreRing } from "@/components/features/ScoreRing";
import { StatsPanel } from "@/components/features/StatsPanel";
import { ChapterProgress } from "@/components/features/ChapterProgress";
import { TrendChart } from "@/components/features/TrendChart";
import { PriorityList } from "@/components/features/PriorityList";
import { ShareDialog } from "@/components/features/ShareDialog";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/id";
import { REPORT_CATEGORIES, type CheckRun, type Issue } from "@/lib/types";

const POLL_MS = 2000;
const STATUS_TOAST: Record<
  "issueIgnored" | "issueFalsePositive" | "issueReopened" | "issueDone",
  string
> = {
  issueDone: t.toast.issueDone,
  issueIgnored: t.toast.issueIgnored,
  issueFalsePositive: t.toast.issueFalsePositive,
  issueReopened: t.toast.issueReopened,
};

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }
  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<CheckRun | null>(null);
  // null = belum dimuat. Tanpa ini halaman sempat menampilkan "Tidak ada temuan" sebelum data tiba.
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [issuesError, setIssuesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");
  const [chapter, setChapter] = useState<string>("all");
  const [sharing, setSharing] = useState(false);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [forceOpen, setForceOpen] = useState<boolean | undefined>(undefined);
  const previousStatus = useRef<CheckRun["status"] | null>(null);

  const fetchRun = useCallback(async () => {
    const { data, error: err } = await api.GET("/checks/{run_id}", {
      params: { path: { run_id: id } },
    });
    if (!data) {
      setError(toApiError(err).message);
      return null;
    }
    setError(null);
    setRun(data);
    return data;
  }, [id]);

  // Polling hanya selama antre atau diproses.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    async function tick() {
      const current = await fetchRun();
      if (cancelled || !current) return;
      if (current.status === "queued" || current.status === "processing") {
        timer = setTimeout(() => void tick(), POLL_MS);
      }
    }
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchRun]);

  // Pemberitahuan hanya saat status benar-benar berubah menjadi selesai atau gagal di halaman ini.
  useEffect(() => {
    if (!run) return;
    const before = previousStatus.current;
    previousStatus.current = run.status;
    if (before === null || before === run.status) return;
    if (run.status === "completed") toast.success(t.toast.checkDone);
    if (run.status === "failed") toast.error(t.toast.checkFailed);
  }, [run]);

  const completed = run?.status === "completed";
  const loadIssues = useCallback(async () => {
    setIssuesError(null);
    const { data, error: err } = await api.GET("/checks/{run_id}/issues", {
      params: { path: { run_id: id } },
    });
    if (data) setIssues(data);
    else setIssuesError(toApiError(err).message);
  }, [id]);

  useEffect(() => {
    if (!completed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadIssues();
  }, [completed, loadIssues]);

  async function setStatus(issue: Issue, status: "open" | "ignored" | "false_positive" | "done") {
    const { data, error: err } = await api.PATCH("/checks/{run_id}/issues/{issue_id}", {
      params: { path: { run_id: id, issue_id: issue.id } },
      body: { user_status: status },
    });
    if (!data) {
      toast.error(toApiError(err).message);
      return;
    }
    setIssues((cur) => (cur ?? []).map((i) => (i.id === data.id ? data : i)));
    const key =
      status === "ignored"
        ? "issueIgnored"
        : status === "false_positive"
          ? "issueFalsePositive"
          : status === "done"
            ? "issueDone"
            : "issueReopened";
    toast.info(STATUS_TOAST[key], { duration: 2500 });
  }

  const chapters = useMemo(() => {
    // Urut sesuai letak di naskah: paragraf paling awal tiap bab; tanpa letak ditaruh di akhir.
    const firstAt = new Map<string, number>();
    for (const i of issues ?? []) {
      const first = i.location.heading_path?.[0];
      if (!first) continue;
      const at = i.location.paragraph_index ?? Number.MAX_SAFE_INTEGER;
      firstAt.set(first, Math.min(firstAt.get(first) ?? at, at));
    }
    return [...firstAt.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "id", { numeric: true }))
      .map(([name]) => name);
  }, [issues]);

  const all = issues ?? [];
  const visible = all.filter((i) => {
    if (category !== "all" && i.category !== category) return false;
    if (severity !== "all" && i.severity !== severity) return false;
    if (chapter !== "all" && i.location.heading_path?.[0] !== chapter) return false;
    return true;
  });
  const filtering = category !== "all" || severity !== "all" || chapter !== "all";

  const totalItems = visible.length;
  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * (pageSize === -1 ? totalItems : pageSize);
  const endIndex = pageSize === -1 ? totalItems : startIndex + pageSize;
  const paginatedIssues = visible.slice(startIndex, endIndex);

  const counts = {
    critical: all.filter((i) => i.severity === "critical").length,
    major: all.filter((i) => i.severity === "major").length,
    minor: all.filter((i) => i.severity === "minor").length,
  };
  const byCategory = (run?.score_by_category ?? {}) as Record<string, number>;

  return (
    <AppShell
      title={t.report.title}
      description={t.pageDesc.report}
      back={{ href: "/riwayat", label: t.nav.history }}
      actions={
        completed && (
          <>
            <Button variant="outline" onClick={() => setSharing(true)}>
              <Icon name="share" /> {t.share.button}
            </Button>
            <DownloadMenu
              items={[
                {
                  href: `/api/checks/${id}/issues-pdf`,
                  label: t.report.issuesPdf,
                  description: t.report.issuesPdfNote,
                },
                {
                  href: `/api/checks/${id}/pdf`,
                  label: t.report.highlightPdf,
                  description: t.report.downloadPdfNote,
                },
                {
                  href: `/api/checks/${id}/fixed`,
                  label: t.report.exportFixed,
                  description: t.report.downloadFixedNote,
                },
              ]}
            />
          </>
        )
      }
    >
      {error && !run && <ErrorState message={error} onRetry={() => void fetchRun()} />}
      {!run && !error && (
        <div aria-busy="true" aria-label={t.common.loading} className="flex flex-col gap-4">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      )}

      {run && (run.status === "queued" || run.status === "processing") && (
        <Card>
          <RunProgress status={run.status} withAi={run.check_types.includes("ai")} />
        </Card>
      )}

      {run?.status === "failed" && (
        <Alert
          tone="error"
          title={t.status.failed}
          action={
            <ButtonLink href="/skripsi" variant="secondary">
              {t.nav.theses}
            </ButtonLink>
          }
        >
          {t.status.failedBody}
        </Alert>
      )}

      {run && completed && (
        <>
          <Card className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <ScoreRing value={Number(run.score_total ?? 0)} />
            <div className="flex w-full flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
                {REPORT_CATEGORIES.filter((c) => c in byCategory).map((c) => (
                  <div key={c} className="rounded-lg bg-primary-50 p-3">
                    <div className="text-[13px] font-semibold leading-4 text-ink-700">
                      <Icon name={c} /> {t.checks[c]}
                    </div>
                    <div className="font-display text-[22px] font-semibold text-ink-900">
                      {Math.round(byCategory[c] ?? 0)}
                    </div>
                  </div>
                ))}
              </div>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold">
                <span className="text-sev-critical">
                  <Icon name="critical" /> {counts.critical} {t.severity.critical}
                </span>
                <span className="text-sev-major">
                  <Icon name="major" /> {counts.major} {t.severity.major}
                </span>
                <span className="text-sev-minor">
                  <Icon name="minor" /> {counts.minor} {t.severity.minor}
                </span>
              </p>
              <p className="text-[13px] leading-5 text-ink-500">{t.report.scoreNote}</p>
            </div>
          </Card>

          {issues && <PriorityList issues={issues} />}
          {issues && <ChapterProgress issues={issues} />}
          <TrendChart runId={id} />

          {run.stats && <StatsPanel stats={run.stats} />}

          <CompareSection runId={id} />

          {run.ai_status === "failed" && (
            <Alert tone="warning" title={t.ai.failedTitle}>
              {run.ai_note ?? t.ai.notConnected}
            </Alert>
          )}
          {run.ai_status === "partial" && (
            <Alert tone="info" title={t.ai.partialTitle}>
              {run.ai_note}
            </Alert>
          )}
          {"ai" in byCategory && (
            <p className="text-[13px] leading-5 text-ink-500">{t.ai.reportNote}</p>
          )}

          <div
            id="daftar-temuan"
            className="sticky top-[59px] z-20 -mx-4 flex flex-col gap-3 border-b border-ink-100/80 bg-canvas px-4 py-3 sm:-mx-6 sm:px-6 lg:top-0 lg:mx-0 lg:border-b-0 lg:px-0 scroll-mt-20"
          >
            <div
              className="flex gap-2 overflow-x-auto pb-1"
              role="tablist"
              aria-label={t.report.issues}
            >
              {["all", ...REPORT_CATEGORIES.filter((c) => c in byCategory)].map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={category === c}
                  onClick={() => {
                    setCategory(c);
                    setPage(1);
                  }}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors",
                    category === c
                      ? "bg-primary-500 text-on-primary"
                      : "bg-surface text-ink-700 shadow-sm hover:bg-primary-50",
                  )}
                >
                  {c !== "all" && <Icon name={c as (typeof REPORT_CATEGORIES)[number]} />}
                  {c === "all" ? t.report.allCategories : t.checks[c as keyof typeof t.checks]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Select
                aria-label="Keparahan"
                value={severity}
                onChange={(e) => {
                  setSeverity(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">{t.report.allSeverities}</option>
                <option value="critical">{t.severity.critical}</option>
                <option value="major">{t.severity.major}</option>
                <option value="minor">{t.severity.minor}</option>
              </Select>
              <Select
                aria-label="Bab"
                value={chapter}
                onChange={(e) => {
                  setChapter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">{t.report.allChapters}</option>
                {chapters.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>

            <div
              className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-ink-500"
              aria-live="polite"
            >
              <span className="font-medium">
                {issues
                  ? pageSize === -1 || totalItems <= pageSize
                    ? t.report.showing(visible.length, all.length)
                    : t.report.showingRange(
                        startIndex + 1,
                        Math.min(endIndex, totalItems),
                        totalItems,
                      )
                  : t.common.loading}
              </span>

              <div className="flex flex-wrap items-center gap-2">
                {visible.length > 20 && (
                  <div className="flex items-center gap-1 text-[12px] text-ink-600">
                    {[20, 50, 100].map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => {
                          setPageSize(size);
                          setPage(1);
                        }}
                        className={cn(
                          "rounded px-2 py-0.5 font-semibold transition-colors",
                          pageSize === size
                            ? "bg-primary-500 text-on-primary shadow-xs"
                            : "bg-surface text-ink-700 shadow-xs hover:bg-primary-50",
                        )}
                      >
                        {size}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setPageSize(-1);
                        setPage(1);
                      }}
                      className={cn(
                        "rounded px-2 py-0.5 font-semibold transition-colors",
                        pageSize === -1
                          ? "bg-primary-500 text-on-primary shadow-xs"
                          : "bg-surface text-ink-700 shadow-xs hover:bg-primary-50",
                      )}
                    >
                      {t.report.allCategories}
                    </button>
                  </div>
                )}

                {visible.length > 0 && (
                  <Button
                    variant="ghost"
                    className="min-h-8 px-2.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-100/50 hover:text-ink-900"
                    onClick={() => setForceOpen((prev) => (prev === true ? false : true))}
                  >
                    <Icon
                      name="chevronDown"
                      className={cn(
                        "transition-transform duration-200",
                        forceOpen === true && "rotate-180",
                      )}
                    />
                    {forceOpen === true ? t.report.collapseAll : t.report.expandAll}
                  </Button>
                )}

                {filtering && (
                  <Button
                    variant="ghost"
                    className="min-h-8 px-2.5 text-[12px] font-semibold text-primary-600 hover:bg-primary-50 hover:text-primary-700"
                    onClick={() => {
                      setCategory("all");
                      setSeverity("all");
                      setChapter("all");
                      setPage(1);
                    }}
                  >
                    <Icon name="refresh" /> {t.report.clearFilters}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <section aria-label={t.report.issues} className="flex flex-col gap-3">
            {issuesError ? (
              <ErrorState message={issuesError} onRetry={() => void loadIssues()} />
            ) : issues === null ? (
              <div aria-busy="true" aria-label={t.common.loading} className="flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : all.length === 0 ? (
              <Alert tone="success">{t.report.none}</Alert>
            ) : visible.length === 0 ? (
              <Alert tone="info">{t.report.noResults}</Alert>
            ) : (
              paginatedIssues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  runId={id}
                  forceOpen={forceOpen}
                  onStatus={(s) => setStatus(issue, s)}
                />
              ))
            )}
          </section>

          {totalPages > 1 && (
            <nav
              aria-label="Paginasi temuan"
              className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100/90 pt-4"
            >
              <Button
                variant="outline"
                disabled={safePage <= 1}
                onClick={() => {
                  const next = Math.max(1, safePage - 1);
                  setPage(next);
                  document.getElementById("daftar-temuan")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="min-h-9 gap-1.5 px-3 text-[13px]"
              >
                <Icon name="back" />
                {t.report.prevPage}
              </Button>

              <div className="flex flex-wrap items-center justify-center gap-1 py-1">
                {getPageNumbers(safePage, totalPages).map((p, idx) =>
                  p === "..." ? (
                    <span key={`ellipsis-${idx}`} className="select-none px-2 text-ink-400">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      aria-current={p === safePage ? "page" : undefined}
                      onClick={() => {
                        setPage(p);
                        document
                          .getElementById("daftar-temuan")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className={cn(
                        "grid size-9 place-items-center rounded-lg text-[13px] font-semibold transition-colors",
                        p === safePage
                          ? "bg-primary-500 text-on-primary shadow-xs"
                          : "bg-surface text-ink-700 shadow-xs hover:bg-primary-50 hover:text-primary-700",
                      )}
                    >
                      {p}
                    </button>
                  ),
                )}
              </div>

              <Button
                variant="outline"
                disabled={safePage >= totalPages}
                onClick={() => {
                  const next = Math.min(totalPages, safePage + 1);
                  setPage(next);
                  document.getElementById("daftar-temuan")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="min-h-9 gap-1.5 px-3 text-[13px]"
              >
                {t.report.nextPage}
                <Icon name="back" className="rotate-180" />
              </Button>
            </nav>
          )}
        </>
      )}
      <ShareDialog runId={id} open={sharing} onClose={() => setSharing(false)} />
    </AppShell>
  );
}
