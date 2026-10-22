import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { chapterProgress } from "@/lib/chapter-progress";
import { t } from "@/lib/i18n/id";
import type { Issue } from "@/lib/types";

export function ChapterProgress({ issues }: { issues: Issue[] }) {
  const rows = chapterProgress(issues);
  if (rows.length === 0) return null;
  const p = t.report.progress;
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 font-display text-[18px] font-semibold text-ink-900">
          <Icon name="listChecks" /> {p.title}
        </h2>
        <p className="text-[13px] leading-5 text-ink-500">{p.note}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => {
          const done = r.total - r.open;
          return (
            <li key={r.chapter} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <span className="font-semibold text-ink-900">{r.chapter}</span>
                <span className="tabular-nums text-ink-700">
                  {r.open === 0 ? (
                    <>
                      <Icon name="done" /> {p.allDone}
                    </>
                  ) : (
                    p.remaining(r.open, r.total)
                  )}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={r.chapter}
                aria-valuemin={0}
                aria-valuemax={r.total}
                aria-valuenow={done}
                className="h-2 rounded-full bg-primary-100"
              >
                <div
                  className="h-2 rounded-full bg-primary-500"
                  style={{ width: `${Math.round((done / r.total) * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
