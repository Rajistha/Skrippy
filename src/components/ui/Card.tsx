import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./Icon";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("min-w-0 rounded-xl bg-surface p-5 shadow-sm sm:p-6", className)}
      {...rest}
    />
  );
}

export function FeatureCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl bg-primary-50 p-6", className)} {...rest} />;
}

export function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: IconName;
}) {
  return (
    <Card className="flex items-start gap-4">
      {icon && (
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-50 text-[20px] text-primary-600">
          <Icon name={icon} />
        </span>
      )}
      <div>
        <div className="font-display text-[34px] font-bold leading-10 text-ink-900">{value}</div>
        <div className="text-[13px] leading-5 text-ink-500">{label}</div>
      </div>
    </Card>
  );
}

/** Status kosong: ikon, satu kalimat penjelas, satu tindakan. */
export function EmptyState({
  title,
  body,
  action,
  icon = "layers",
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary-200 bg-primary-50/60 px-6 py-14 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-surface text-[28px] text-primary-500 shadow-sm">
        <Icon name={icon} />
      </span>
      <h3 className="text-[20px] font-semibold leading-7 text-ink-900">{title}</h3>
      <p className="max-w-sm text-[15px] leading-6 text-ink-500">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
