"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { IssueCard } from "@/components/features/IssueCard";
import { ScoreRing } from "@/components/features/ScoreRing";
import { Card, EmptyState } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDateWib } from "@/lib/format";
import { t } from "@/lib/i18n/id";
import type { SharedReport } from "@/lib/schemas";
import { REPORT_CATEGORIES } from "@/lib/types";

/** Laporan baca-saja untuk dosen. Tanpa login, tanpa tombol ubah. */
export default function SharedReportPage() {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<SharedReport | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [category, setCategory] = useState("all");
  const s = t.share;

  useEffect(() => {
    let cancelled = false;
    void api.GET("/public/share/{token}", { params: { path: { token } } }).then(({ data }) => {
      if (cancelled) return;
      if (data) setReport(data);
      else setInvalid(true);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const categories = useMemo(
    () => REPORT_CATEGORIES.filter((c) => report && c in report.score_by_category),
    [report],
  );
  const visible = (report?.issues ?? []).filter(
    (i) => category === "all" || i.category === category,
  );

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="bg-hero">
        <div className="mx-auto flex h-[72px] max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label={t.pages.home}>
            <Logo tone="light" />
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-[13px] font-semibold text-white">
            <Icon name="eye" /> Hanya baca
          </span>
        </div>
      </header>

      <main id="konten" className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-8 sm:px-6">
        {!report && !invalid && <Skeleton className="h-48 w-full rounded-xl" />}

        {invalid && (
          <EmptyState
            icon="lock"
            title={s.invalid}
            body={s.invalidBody}
            action={
              <ButtonLink href="/" variant="outline">
                {t.pages.home}
              </ButtonLink>
            }
          />
        )}

        {report && (
          <>
            <div>
              <h1 className="font-display text-[28px] font-semibold leading-9 text-ink-900 sm:text-[32px] sm:leading-10">
                {report.thesis_title}
              </h1>
              <p className="text-[15px] text-ink-500">
                {s.version(report.version_no)} · diperiksa {formatDateWib(report.checked_at)} ·{" "}
                {s.validUntil(formatDateWib(report.expires_at))}
              </p>
              <p className="mt-1 text-[13px] text-ink-500">{s.sharedBy}</p>
            </div>

            <Card className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              <ScoreRing value={Number(report.score_total ?? 0)} />
              <div className="grid w-full grid-cols-2 gap-3 md:grid-cols-4">
                {categories.map((c) => (
                  <div key={c} className="rounded-lg bg-primary-50 p-3">
                    <div className="text-[13px] font-semibold leading-4 text-ink-700">
                      <Icon name={c} /> {t.checks[c]}
                    </div>
                    <div className="font-display text-[22px] font-semibold text-ink-900">
                      {Math.round(report.score_by_category[c] ?? 0)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <div
              className="flex gap-2 overflow-x-auto pb-1"
              role="tablist"
              aria-label={t.report.issues}
            >
              {["all", ...categories].map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={category === c}
                  onClick={() => setCategory(c)}
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

            <section aria-label={t.report.issues} className="flex flex-col gap-3">
              {visible.length === 0 ? (
                <p className="rounded-xl bg-surface p-6 text-center text-ink-500 shadow-sm">
                  {t.report.none}
                </p>
              ) : (
                visible.map((issue) => <IssueCard key={issue.id} issue={issue} readOnly />)
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
