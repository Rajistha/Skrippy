import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./Icon";

export type AlertTone = "info" | "success" | "warning" | "error";

export const TONE_STYLE: Record<AlertTone, { box: string; icon: IconName; label: string }> = {
  info: { box: "bg-sev-minor-bg text-sev-minor", icon: "info", label: "Informasi" },
  success: { box: "bg-sev-success-bg text-sev-success", icon: "success", label: "Berhasil" },
  warning: { box: "bg-sev-major-bg text-sev-major", icon: "warning", label: "Perhatian" },
  error: { box: "bg-sev-critical-bg text-sev-critical", icon: "critical", label: "Kesalahan" },
};

/** Pesan inline. Selalu ada ikon berbentuk khas dan teks, tidak mengandalkan warna saja. */
export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const s = TONE_STYLE[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-lg p-4 text-[14px] leading-5",
        s.box,
        className,
      )}
    >
      <Icon name={s.icon} size={20} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5")}>{children}</div>}
        {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}
