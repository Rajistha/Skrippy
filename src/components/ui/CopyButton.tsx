"use client";

import { useState } from "react";
import { t } from "@/lib/i18n/id";
import { Button, type ButtonVariant } from "./Button";
import { Icon } from "./Icon";
import { toast } from "./Toast";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Cadangan untuk konteks tanpa Clipboard API.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Tombol salin dengan umpan balik: label berubah sebentar dan toast tampil. */
export function CopyButton({
  text,
  label,
  successMessage = t.common.copiedToClipboard,
  variant = "secondary",
  className,
  iconOnly = false,
}: {
  text: string;
  label: string;
  successMessage?: string;
  variant?: ButtonVariant;
  className?: string;
  /** Hanya ikon (label tetap dibacakan pembaca layar). */
  iconOnly?: boolean;
}) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant={variant}
      className={iconOnly ? `size-9 min-h-9 px-0 ${className ?? ""}` : className}
      aria-label={iconOnly ? label : undefined}
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          toast.success(successMessage, { duration: 2500 });
          setTimeout(() => setDone(false), 2000);
        } else {
          toast.error(t.common.copyFailed);
        }
      }}
    >
      <Icon name={done ? "done" : "copy"} />
      {!iconOnly && <> {done ? t.common.copied : label}</>}
    </Button>
  );
}
