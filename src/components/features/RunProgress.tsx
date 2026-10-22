import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { t } from "@/lib/i18n/id";
import type { CheckRun } from "@/lib/types";

const STEPS = [
  t.status.uploaded,
  t.status.queued,
  t.status.processing,
  t.status.completed,
] as const;

function stepIndex(status: CheckRun["status"]): number {
  return { queued: 1, processing: 2, completed: 3, failed: 2 }[status];
}

/** Stepper status pemeriksaan. Diumumkan ke pembaca layar lewat aria-live. */
export function RunProgress({
  status,
  withAi = false,
}: {
  status: CheckRun["status"];
  /** Cek ini memakai analisis AI, yang diproses bergiliran dan bisa memakan waktu lebih lama. */
  withAi?: boolean;
}) {
  const current = stepIndex(status);
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <ol className="flex items-center gap-2 overflow-x-auto">
        {STEPS.map((label, i) => {
          const done = i < current || status === "completed";
          const active = i === current && status !== "completed" && status !== "failed";
          return (
            <li key={label} className="flex items-center gap-2 text-[13px] font-semibold">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full",
                  done
                    ? "bg-sev-success-bg text-sev-success"
                    : active
                      ? "animate-pulse bg-primary-500 text-on-primary"
                      : "bg-ink-100 text-ink-400",
                )}
              >
                {done ? <Icon name="done" /> : i + 1}
              </span>
              <span className={cn(done || active ? "text-ink-900" : "text-ink-400")}>{label}</span>
              {i < STEPS.length - 1 && (
                <span aria-hidden="true" className="h-px w-4 bg-ink-200 sm:w-8" />
              )}
            </li>
          );
        })}
      </ol>
      {(status === "queued" || status === "processing") && (
        <div role="progressbar" aria-label={t.status.waiting} className="wait-bar" />
      )}
      <p className="text-[13px] leading-5">
        {status === "failed"
          ? t.status.failedBody
          : status === "queued"
            ? t.status.queuedHint
            : status === "processing" &&
              (withAi ? t.status.processingAiHint : t.status.processingHint)}
      </p>
    </div>
  );
}
