import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/id";
import { Icon } from "./Icon";

export type ButtonVariant =
  | "primary"
  | "cta"
  | "heroLight"
  | "outlineLight"
  | "secondary"
  | "ghost"
  | "danger"
  | "dangerSolid"
  | "outline"
  | "mint";

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[13px] font-semibold " +
  "transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-45 select-none";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary-500 text-on-primary shadow-cta hover:bg-primary-600 active:bg-primary-700",
  cta: "bg-cta text-on-primary shadow-cta hover:brightness-95",
  heroLight: "bg-white text-primary-600 hover:bg-primary-50",
  outlineLight: "border border-white/60 text-white hover:bg-white/10",
  secondary: "bg-primary-50 text-primary-700 hover:bg-primary-100",
  ghost: "text-primary-600 hover:bg-primary-100 active:bg-primary-200",
  danger: "bg-sev-critical-bg text-sev-critical hover:bg-sev-critical hover:text-white",
  dangerSolid: "bg-sev-critical text-white hover:brightness-95",
  outline:
    "border border-primary-500 text-primary-600 hover:border-primary-600 hover:bg-primary-100 hover:shadow-sm active:bg-primary-200",
  mint: "bg-accent-300 text-primary-900 shadow-md hover:bg-accent-400 font-bold",
};

type Common = { variant?: ButtonVariant; children: ReactNode; className?: string };

export function Button({
  variant = "primary",
  className,
  loading,
  children,
  disabled,
  ...rest
}: Common & { loading?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(BASE, VARIANTS[variant], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <>
          <Icon name="spinner" spin />
          {t.common.loading}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  className,
  href,
  external,
  download,
  children,
}: Common & { href: string; external?: boolean; download?: boolean }) {
  const cls = cn(BASE, VARIANTS[variant], className);
  // Unduhan memakai <a> biasa: Link Next.js akan mencoba navigasi klien ke endpoint berkas.
  if (download) {
    return (
      <a className={cls} href={href} download>
        {children}
      </a>
    );
  }
  if (external) {
    return (
      <a className={cls} href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link className={cls} href={href}>
      {children}
    </Link>
  );
}
