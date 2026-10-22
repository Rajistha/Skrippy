"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/id";
import { Icon, type IconName } from "./Icon";

export type ModalTone = "default" | "danger" | "success";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** false: tidak bisa ditutup dengan Esc, klik latar, atau tombol X (mis. saat sedang memproses). */
  dismissible?: boolean;
  icon?: IconName;
  tone?: ModalTone;
};

const SIZE = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-2xl" } as const;
const TONE: Record<ModalTone, string> = {
  default: "bg-primary-50 text-primary-600",
  danger: "bg-sev-critical-bg text-sev-critical",
  success: "bg-sev-success-bg text-sev-success",
};

/**
 * Modal di atas elemen <dialog> native: fokus terkunci di dalam, latar belakang inert, Esc menutup,
 * dan fokus dikembalikan ke pemicu saat ditutup. Di ponsel tampil sebagai lembar dari bawah.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
  icon,
  tone = "default",
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    document.documentElement.classList.toggle("modal-open", open);
    return () => document.documentElement.classList.remove("modal-open");
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        // Esc: biarkan React yang mengendalikan state, bukan browser.
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-none overflow-visible rounded-xl bg-surface p-0 text-ink-500 shadow-lg",
        "backdrop:bg-ink-900/50 backdrop:backdrop-blur-[2px]",
        "max-sm:mb-0 max-sm:mt-auto max-sm:w-full max-sm:rounded-b-none",
        SIZE[size],
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start gap-4 p-5 pb-3 sm:p-6 sm:pb-3">
            {icon && (
              <span
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-full text-[20px]",
                  TONE[tone],
                )}
              >
                <Icon name={icon} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-[20px] font-semibold leading-7 text-ink-900">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-[15px] leading-6">
                  {description}
                </p>
              )}
            </div>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t.common.close}
                className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900"
              >
                <Icon name="close" size={20} />
              </button>
            )}
          </div>
          {children && <div className="overflow-y-auto px-5 pb-2 sm:px-6">{children}</div>}
          {footer && (
            <div className="flex flex-col-reverse gap-3 p-5 pt-4 sm:flex-row sm:justify-end sm:p-6 sm:pt-4">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
