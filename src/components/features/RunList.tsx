import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Badge";
import { formatDateTimeWib } from "@/lib/format";
import { t } from "@/lib/i18n/id";
import type { CheckRun } from "@/lib/types";

const STATUS_TONE = {
  queued: "neutral",
  processing: "primary",
  completed: "success",
  failed: "neutral",
} as const;

export function RunList({ runs }: { runs: CheckRun[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {runs.map((run) => (
        <li key={run.id}>
          <Link
            href={`/laporan/${run.id}`}
            className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-ink-200 bg-surface px-4 py-3 hover:border-primary-300"
          >
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold text-ink-900">
                {run.check_types.map((c) => t.checks[c as keyof typeof t.checks] ?? c).join(", ")}
              </span>
              <span className="text-[13px] leading-5">{formatDateTimeWib(run.created_at)}</span>
            </span>
            <span className="flex items-center gap-3">
              {run.status === "completed" && run.score_total != null && (
                <span className="font-display text-[20px] font-semibold text-ink-900">
                  {Math.round(Number(run.score_total))}
                </span>
              )}
              <Pill
                tone={STATUS_TONE[run.status]}
                icon={run.status === "completed" ? "done" : "info"}
              >
                {t.status[run.status]}
              </Pill>
              <Icon name="arrow" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
