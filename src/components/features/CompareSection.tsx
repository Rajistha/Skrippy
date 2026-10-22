"use client";

import { useEffect, useState } from "react";
import { SeverityBadge, type Severity } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, toApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/id";
import type { Comparison } from "@/lib/schemas";
import { locationText } from "./IssueCard";

type Issue = Comparison["fixed"][number];

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "bad" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-lg p-3",
        tone === "good"
          ? "bg-sev-success-bg"
          : tone === "bad"
            ? "bg-sev-critical-bg"
            : "bg-primary-50",
      )}
    >
      <p className="font-display text-[26px] font-bold leading-8 text-ink-900">{value}</p>
      <p className="text-[13px] font-semibold leading-4 text-ink-700">{label}</p>
    </div>
  );
}

function Rows({ issues }: { issues: Issue[] }) {
  return (
    <ul className="mt-2 flex flex-col divide-y divide-ink-100 rounded-lg border border-ink-200">
      {issues.map((i) => (
        <li key={i.id} className="flex flex-col gap-1 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={i.severity as Severity} />
            <span className="min-w-0 flex-1 text-[14px] font-medium text-ink-900">{i.message}</span>
          </div>
          {locationText(i.location) && (
            <p className="text-[12px] text-ink-500">{locationText(i.location)}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Dibanding versi naskah sebelumnya: temuan yang sudah diperbaiki, yang baru, dan yang masih tetap. */
export function CompareSection({ runId }: { runId: string }) {
  const c = t.compare;
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<"fixed" | "added" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .GET("/checks/{run_id}/compare", { params: { path: { run_id: runId } } })
      .then(({ data: d, error: err }) => {
        if (cancelled) return;
        if (d) setData(d);
        else setError(toApiError(err).message);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (error) return null; // perbandingan hanya pelengkap; kegagalannya tidak boleh mengganggu laporan
  if (!data) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (!data.base) return null;

  const delta = data.score_delta;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[18px] font-semibold leading-7 text-ink-900">
          <Icon name="layers" className="text-primary-600" /> {c.title(data.base.version_no)}
        </h2>
        {delta !== null && (
          <span
            className={cn(
              "rounded-full px-3 py-1 text-[13px] font-semibold",
              delta > 0
                ? "bg-sev-success-bg text-sev-success"
                : delta < 0
                  ? "bg-sev-critical-bg text-sev-critical"
                  : "bg-ink-100 text-ink-500",
            )}
          >
            {delta > 0 ? c.scoreUp(delta) : delta < 0 ? c.scoreDown(Math.abs(delta)) : c.scoreSame}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Tile label={c.fixed} value={data.counts.fixed} tone="good" />
        <Tile
          label={c.added}
          value={data.counts.added}
          tone={data.counts.added > 0 ? "bad" : "neutral"}
        />
        <Tile label={c.remaining} value={data.counts.remaining} tone="neutral" />
      </div>
      <div className="flex flex-wrap gap-2">
        {(["fixed", "added"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-expanded={open === k}
            disabled={data.counts[k] === 0}
            onClick={() => setOpen(open === k ? null : k)}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink-200 px-4 text-[13px] font-semibold text-ink-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name={open === k ? "minus" : "plus"} />{" "}
            {k === "fixed" ? c.showFixed : c.showAdded}
          </button>
        ))}
      </div>
      {open && <Rows issues={data[open]} />}
      {data.chapters.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[14px] font-semibold text-ink-900">{c.chapterChanges}</h3>
          <ul className="flex flex-col divide-y divide-ink-100 rounded-lg border border-ink-200 text-[13px]">
            {data.chapters.map((ch) => {
              const diff = ch.words - ch.base_words;
              return (
                <li
                  key={ch.name}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="font-semibold text-ink-900">{ch.name}</span>
                  <span className="tabular-nums text-ink-700">
                    {ch.base_words} <Icon name="arrow" /> {ch.words} {c.words}{" "}
                    <span className={diff === 0 ? "text-ink-500" : "font-semibold"}>
                      ({diff > 0 ? "+" : ""}
                      {diff})
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
