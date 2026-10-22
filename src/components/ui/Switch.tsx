"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

type ToggleProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  "aria-labelledby"?: string;
  "aria-label"?: string;
};

/** Toggle geser (role="switch"): bisa dioperasikan dengan klik, Spasi, dan Enter. */
export function Toggle({ checked, onChange, disabled, ...aria }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-100",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary-500" : "bg-ink-200",
      )}
      {...aria}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

/** Baris pengaturan: judul dan penjelasan di kiri, toggle di kanan. Seluruh baris bisa diklik. */
export function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  className,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div
      className={cn(
        "flex min-h-14 items-center justify-between gap-4 rounded-lg border border-ink-200 px-4 py-3",
        !disabled && "cursor-pointer hover:bg-primary-50/40",
        className,
      )}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className="min-w-0">
        <span id={id} className="block text-[15px] font-semibold leading-5 text-ink-900">
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block text-[13px] leading-5 text-ink-500">{description}</span>
        )}
      </span>
      <span onClick={(e) => e.stopPropagation()}>
        <Toggle checked={checked} onChange={onChange} disabled={disabled} aria-labelledby={id} />
      </span>
    </div>
  );
}
