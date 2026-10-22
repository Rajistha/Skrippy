"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { downloadFile } from "@/lib/download";
import { t } from "@/lib/i18n/id";

export type DownloadItem = { href: string; label: string; description: string };

/** Satu tombol "Unduh" yang membuka daftar berkas. Berkas disusun di server, jadi tiap item punya status memuat. */
export function DownloadMenu({ items }: { items: DownloadItem[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function pick(item: DownloadItem) {
    setBusy(item.href);
    try {
      const { changes } = await downloadFile(item.href);
      if (changes !== null)
        toast.success(changes > 0 ? t.toast.fixedApplied(changes) : t.toast.fixedNone);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.toast.downloadFailed);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={root} className="relative">
      <Button
        variant="outline"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="download" /> {t.report.downloadMenu} <Icon name="chevronDown" />
      </Button>
      {open && (
        <ul
          role="menu"
          aria-label={t.report.downloadMenu}
          className="absolute right-0 z-20 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-lg border border-ink-200 bg-surface p-2 shadow-lg"
        >
          {items.map((item) => (
            <li key={item.href} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={busy !== null}
                aria-busy={busy === item.href || undefined}
                onClick={() => void pick(item)}
                className="flex min-h-11 w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-primary-100 focus-visible:bg-primary-100 disabled:cursor-wait disabled:opacity-60"
              >
                <span className="mt-0.5 text-primary-600">
                  <Icon
                    name={busy === item.href ? "spinner" : "download"}
                    spin={busy === item.href}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-ink-900">{item.label}</span>
                  <span className="block text-[12px] leading-4 text-ink-500">
                    {item.description}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
