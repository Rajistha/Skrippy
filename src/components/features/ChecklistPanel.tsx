import { Card } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/id";
import type { CheckRun } from "@/lib/types";

type Checklist = NonNullable<NonNullable<CheckRun["stats"]>["checklist"]>;
type Status = Checklist["items"][number]["status"];

/** Status dibedakan oleh bentuk ikon dan teks, bukan warna saja. */
const STATUS: Record<Status, { icon: IconName; tone: string }> = {
  ok: { icon: "success", tone: "text-sev-success" },
  missing: { icon: "critical", tone: "text-sev-critical" },
  warn: { icon: "major", tone: "text-sev-major" },
  manual: { icon: "help", tone: "text-ink-500" },
};

/** Checklist kelengkapan naskah. Bukan temuan dan tidak memengaruhi skor. */
export function ChecklistPanel({ checklist }: { checklist: Checklist }) {
  const c = t.report.checklist;
  const pct = checklist.total ? Math.round((checklist.done / checklist.total) * 100) : 100;
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-[18px] font-semibold text-ink-900">
          <Icon name="listChecks" /> {c.title}
        </h2>
        <p className="text-[13px] leading-5 text-ink-500">{c.note}</p>
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-3 text-[14px]">
          <span className="font-semibold text-ink-900">
            {c.progress(checklist.done, checklist.total)}
          </span>
          <span className="tabular-nums text-ink-500">{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-label={c.title}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-primary-100"
        >
          <div className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="grid gap-x-6 sm:grid-cols-2">
        {checklist.items.map((item) => {
          const s = STATUS[item.status];
          return (
            <li key={item.key} className="flex items-start gap-3 border-t border-ink-100 py-2.5">
              <Icon name={s.icon} className={cn("mt-0.5 text-[18px]", s.tone)} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center justify-between gap-x-2 text-[14px] leading-5">
                  <span className="font-semibold text-ink-900">{item.label}</span>
                  <span className={cn("text-[12px] font-semibold", s.tone)}>
                    {c.statusLabel[item.status]}
                  </span>
                </p>
                {item.detail && <p className="text-[13px] leading-5 text-ink-500">{item.detail}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
