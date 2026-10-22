"use client";

import { useState } from "react";
import { RuleCode, SeverityBadge, type Severity } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/id";
import { ruleHelp } from "@/lib/rule-help";
import type { Issue } from "@/lib/types";

export function locationText(location: Issue["location"]): string {
  const path = Array.isArray(location.heading_path) ? (location.heading_path as string[]) : [];
  const parts = [...path];
  if (typeof location.paragraph_index === "number")
    parts.push(`paragraf ${location.paragraph_index + 1}`);
  if (typeof location.page === "number") parts.push(`sekitar halaman ${location.page}`);
  return parts.join(" › ");
}

type Props = {
  issue: Issue;
  /** Bila diisi, tampilkan "Abaikan selalu" untuk menyimpan temuan ke daftar abaikan pengguna. */
  runId?: string;
  onStatus?: (status: "open" | "ignored" | "false_positive" | "done") => Promise<void>;
  /** Tampilan pembaca tautan: tanpa tombol ubah status. */
  readOnly?: boolean;
  /** Sinkronisasi buka/tutup massal dari luar. */
  forceOpen?: boolean;
};

export function IssueCard({ issue, runId, onStatus, readOnly = false, forceOpen }: Props) {
  const [prevForceOpen, setPrevForceOpen] = useState(forceOpen);
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  if (forceOpen !== prevForceOpen) {
    setPrevForceOpen(forceOpen);
    setUserToggled(null);
  }

  const open =
    userToggled !== null
      ? userToggled
      : typeof forceOpen === "boolean"
        ? forceOpen
        : issue.severity === "critical";
  const muted = issue.user_status !== "open";
  const where = locationText(issue.location);
  const help = ruleHelp(issue.rule_code);

  async function set(status: "open" | "ignored" | "false_positive" | "done") {
    setBusy(true);
    await onStatus?.(status);
    setBusy(false);
  }

  async function always() {
    if (!runId) return;
    setBusy(true);
    const { error } = await api.POST("/checks/{run_id}/issues/{issue_id}/always", {
      params: { path: { run_id: runId, issue_id: issue.id } },
    });
    if (error) {
      toast.error(toApiError(error).message);
    } else {
      toast.success(t.ignored.alwaysDone);
      await onStatus?.("ignored");
    }
    setBusy(false);
  }

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border border-ink-200/90 bg-surface shadow-xs transition-shadow hover:shadow-sm",
        muted && "opacity-60",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setUserToggled(!open)}
        className="group flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-ink-50/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={issue.severity as Severity} />
            <RuleCode code={issue.rule_code} />
          </div>
          <h3 className="mt-2 text-[15px] font-semibold leading-snug text-ink-900 sm:text-[16px]">
            {issue.message}
          </h3>
        </div>
        <span className="grid size-8 shrink-0 place-items-center rounded-full text-ink-400 transition-colors group-hover:bg-ink-100 group-hover:text-ink-700">
          <Icon
            name="chevronDown"
            size={18}
            className={cn("transition-transform duration-200", open && "rotate-180")}
          />
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3.5 border-t border-ink-100/80 bg-surface p-4 pt-3.5">
          {issue.excerpt && (
            <blockquote className="rounded-r-lg border-l-4 border-primary-500 bg-primary-50/60 px-4 py-2.5 font-serif text-[14px] italic leading-relaxed text-ink-800">
              &ldquo;{issue.excerpt}&rdquo;
            </blockquote>
          )}

          {where && (
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-600">
              <span className="font-semibold text-ink-800">{t.report.location}:</span>
              <span className="rounded-md bg-ink-100 px-2.5 py-0.5 font-mono text-[12px] font-medium text-ink-700">
                {where}
              </span>
            </div>
          )}

          {issue.suggestion && (
            <div className="flex items-start gap-3 rounded-lg border border-primary-200/80 bg-primary-50/60 p-3 text-primary-950">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-500 text-white">
                <Icon name="arrow" size={12} className="text-white" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-primary-700">
                  {t.report.suggestion}
                </span>
                <span className="mt-0.5 block text-[14px] font-medium leading-relaxed text-primary-900">
                  {issue.suggestion}
                </span>
              </div>
            </div>
          )}

          {issue.user_status === "done" && (
            <div className="flex items-center gap-2 rounded-lg bg-sev-success-bg/60 p-3 text-[13px] font-medium text-sev-success">
              <Icon name="done" size={16} />
              <span>{t.report.doneNote}</span>
            </div>
          )}

          {help && (
            <details className="group/help overflow-hidden rounded-lg border border-ink-200/80 bg-surface text-[13px] transition-colors">
              <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-2 p-3 font-medium text-ink-700 transition-colors hover:bg-ink-50/60 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <Icon name="info" size={15} className="text-primary-600" />
                  <span className="font-semibold text-ink-800">{t.report.ruleHelp}</span>
                </span>
                <Icon
                  name="chevronDown"
                  size={16}
                  className="text-ink-400 transition-transform duration-200 group-open/help:rotate-180"
                />
              </summary>
              <div className="space-y-2 border-t border-ink-100 bg-ink-50/40 p-3.5 leading-relaxed">
                <div>
                  <span className="font-semibold text-ink-900">{t.report.ruleWhy}:</span>{" "}
                  <span className="text-ink-600">{help.why}</span>
                </div>
                <div>
                  <span className="font-semibold text-ink-900">{t.report.ruleHow}:</span>{" "}
                  <span className="text-ink-600">{help.how}</span>
                </div>
              </div>
            </details>
          )}

          <div
            className={cn(
              "mt-1 flex flex-col gap-3 border-t border-ink-100/90 pt-3.5 sm:flex-row sm:items-center sm:justify-between",
              readOnly && "hidden",
            )}
          >
            {issue.user_status === "open" ? (
              <>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void set("done")}
                  className="min-h-9 w-full border-primary-500 bg-primary-50/40 px-4 py-1.5 text-primary-700 transition-colors hover:bg-primary-500 hover:text-white sm:w-auto"
                >
                  <Icon name="done" /> {t.report.markDone}
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void set("ignored")}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-ink-200 bg-surface px-3 py-1 text-[12px] font-medium text-ink-600 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-50"
                  >
                    <Icon name="minus" size={13} className="text-ink-400" />
                    {t.report.ignore}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void set("false_positive")}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-ink-200 bg-surface px-3 py-1 text-[12px] font-medium text-ink-600 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-50"
                  >
                    <Icon name="flag" size={13} className="text-ink-400" />
                    {t.report.falsePositive}
                  </button>
                  {runId && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void always()}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-ink-200 bg-surface px-3 py-1 text-[12px] font-medium text-ink-600 transition-colors hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-50"
                    >
                      <Icon name="ban" size={13} className="text-ink-400" />
                      {t.ignored.always}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex w-full items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sev-success-bg px-3 py-1 text-[12px] font-semibold text-sev-success">
                  <Icon name="done" size={14} />
                  {issue.user_status === "done" ? t.status.completed : t.report.ignore}
                </span>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void set("open")}
                  className="min-h-9 px-3 py-1"
                >
                  <Icon name="refresh" size={14} /> {t.report.reopen}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
