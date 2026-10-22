import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/id";
import { Icon, type IconName } from "./Icon";

export type Severity = "critical" | "major" | "minor";

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "bg-sev-critical-bg text-sev-critical",
  major: "bg-sev-major-bg text-sev-major",
  minor: "bg-sev-minor-bg text-sev-minor",
};

/** Keparahan selalu simbol + label, bukan warna saja. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold leading-4",
        SEVERITY_STYLE[severity],
      )}
    >
      <Icon name={severity} />
      {t.severity[severity]}
    </span>
  );
}

export function Pill({
  children,
  tone = "accent",
  icon,
}: {
  children: ReactNode;
  tone?: "accent" | "primary" | "success" | "neutral";
  icon?: IconName;
}) {
  const tones = {
    accent: "bg-accent-100 text-accent-700 ring-accent-200",
    primary: "bg-primary-100 text-primary-700 ring-primary-200",
    success: "bg-sev-success-bg text-sev-success ring-sev-success/20",
    neutral: "bg-ink-100 text-ink-500 ring-ink-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold leading-4 ring-1 ring-inset",
        tones[tone],
      )}
    >
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export function RuleCode({ code }: { code: string }) {
  return (
    <span className="rounded-sm bg-ink-100 px-2 py-0.5 font-mono text-[12px] font-medium text-ink-700">
      {code}
    </span>
  );
}
