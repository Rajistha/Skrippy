"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { formatCodeInput, isCodeComplete } from "@/lib/format";
import { t } from "@/lib/i18n/id";

type Props = {
  initial?: string;
  onSubmit: (code: string) => void | Promise<void>;
  /** Dipanggil saat pengguna mengetik, agar pemanggil bisa menghapus pesan error lama. */
  onChange?: (code: string) => void;
  error?: string | null;
  loading?: boolean;
  label?: string;
  submitLabel?: string;
  /** Tampilkan petunjuk format di bawah input. */
  showHint?: boolean;
  autoFocus?: boolean;
  /** Sembunyikan label (bila konteks sudah jelas). Label tetap tersedia untuk pembaca layar. */
  hideLabel?: boolean;
};

/** Input kode akses (docs/DESIGN.md 7.4): mono, kapital otomatis, tanda hubung otomatis, validasi langsung. */
export function CodeInput({
  initial = "",
  onSubmit,
  onChange,
  error,
  loading,
  label,
  submitLabel,
  showHint = false,
  autoFocus,
  hideLabel,
}: Props) {
  const id = useId();
  const [value, setValue] = useState(formatCodeInput(initial));
  const complete = isCodeComplete(value);
  const partial = value.length > 0 && !complete;

  function update(next: string) {
    const formatted = formatCodeInput(next);
    setValue(formatted);
    onChange?.(formatted);
  }

  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) void onSubmit(value);
      }}
    >
      <label
        htmlFor={id}
        className={cn("text-[13px] font-semibold leading-4 text-ink-700", hideLabel && "sr-only")}
      >
        {label ?? t.landing.codeLabel}
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <input
            id={id}
            value={value}
            onChange={(e) => update(e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              update(e.clipboardData.getData("text"));
            }}
            placeholder={t.code.placeholder}
            autoComplete="off"
            autoCapitalize="characters"
            autoFocus={autoFocus}
            spellCheck={false}
            inputMode="text"
            maxLength={20}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-hint`}
            className={cn(
              "min-h-12 w-full rounded-full border bg-surface pl-5 pr-12 font-mono text-[17px] uppercase tracking-[0.1em] text-ink-900 placeholder:text-ink-400",
              "focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100",
              error ? "border-sev-critical" : complete ? "border-primary-500" : "border-ink-400",
            )}
          />
          {complete && (
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-primary-500">
              <Icon name="success" size={20} label={t.code.complete} />
            </span>
          )}
        </div>
        <Button
          type="submit"
          variant="cta"
          loading={loading}
          disabled={!complete}
          className="sm:min-w-36"
        >
          {submitLabel ?? t.code.submit} <Icon name="arrow" />
        </Button>
      </div>
      <p
        id={`${id}-hint`}
        role={error ? "alert" : undefined}
        className={cn(
          "flex items-start gap-1.5 text-[13px] leading-5",
          error ? "text-sev-critical" : "text-ink-500",
        )}
      >
        {error ? (
          <>
            <Icon name="critical" className="mt-0.5" /> {error}
          </>
        ) : partial ? (
          t.code.incomplete
        ) : (
          showHint && t.code.helpFormat
        )}
      </p>
    </form>
  );
}
