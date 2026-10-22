import { SeverityBadge, RuleCode, type Severity } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { t } from "@/lib/i18n/id";
import { topPriorities } from "@/lib/priorities";
import type { Issue } from "@/lib/types";

/** Lima aturan dengan dampak terbesar, supaya mahasiswa tahu harus mulai dari mana. */
export function PriorityList({ issues }: { issues: Issue[] }) {
  const items = topPriorities(issues, 5);
  if (items.length === 0) return null;
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 font-display text-[18px] font-semibold text-ink-900">
          <Icon name="listChecks" /> {t.report.priorities.title}
        </h2>
        <p className="text-[13px] leading-5 text-ink-500">{t.report.priorities.note}</p>
      </div>
      <ol className="flex flex-col gap-3">
        {items.map((p, n) => (
          <li key={p.ruleCode} className="flex flex-col gap-1 rounded-lg bg-primary-50 p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-display text-[15px] font-semibold text-ink-900">{n + 1}.</span>
              <SeverityBadge severity={p.severity as Severity} />
              <RuleCode code={p.ruleCode} />
              <span className="text-[13px] font-semibold text-ink-700">
                {t.report.priorities.count(p.count)}
              </span>
            </div>
            <p className="text-[14px] leading-5 text-ink-900">{p.example}</p>
            {p.how && (
              <p className="text-[13px] leading-5 text-ink-700">
                <Icon name="arrow" /> {p.how}
              </p>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
