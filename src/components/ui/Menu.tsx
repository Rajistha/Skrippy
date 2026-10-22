"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./Icon";

export type MenuItem = {
  label: string;
  icon?: IconName;
  href?: string;
  onSelect?: () => void;
  tone?: "danger";
};

type Props = {
  /** Isi tombol pemicu (mis. avatar). */
  children: ReactNode;
  /** Label untuk pembaca layar, wajib karena isi tombol biasanya visual saja. */
  label: string;
  items: MenuItem[];
  header?: ReactNode;
  className?: string;
  /** Kelas tombol pemicu; bawaan berbentuk pil kecil. */
  triggerClassName?: string;
  /** Arah buka: "down" ke bawah rata kanan, "up" ke atas selebar pemicu. */
  placement?: "down" | "up";
};

/** Menu popover: Esc menutup dan mengembalikan fokus, panah atas/bawah berpindah, klik di luar menutup. */
export function Menu({
  children,
  label,
  items,
  header,
  className,
  triggerClassName,
  placement = "down",
}: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, close]);

  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const nodes = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (nodes.length === 0) return;
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "ArrowDown"
        ? (index + 1) % nodes.length
        : (index - 1 + nodes.length) % nodes.length;
    nodes[next]?.focus();
  }

  return (
    <div ref={root} className={cn("relative", className)} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-full p-1 pr-2 transition-colors hover:bg-primary-50",
          triggerClassName,
        )}
      >
        {children}
        <Icon
          name="chevronDown"
          className={cn("text-ink-400 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          className={cn(
            "rise absolute z-30 rounded-lg bg-surface p-2 shadow-lg ring-1 ring-ink-100",
            placement === "up" ? "inset-x-0 bottom-full mb-2" : "right-0 top-full mt-2 w-64",
          )}
        >
          {header && <div className="border-b border-ink-100 px-3 pb-2 pt-1">{header}</div>}
          <div className="pt-1">
            {items.map((item) => {
              const cls = cn(
                "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-[15px] font-medium",
                item.tone === "danger"
                  ? "text-sev-critical hover:bg-sev-critical-bg"
                  : "text-ink-700 hover:bg-primary-50",
              );
              const content = (
                <>
                  {item.icon && <Icon name={item.icon} />}
                  {item.label}
                </>
              );
              return item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  role="menuitem"
                  className={cls}
                  onClick={() => close()}
                >
                  {content}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={cls}
                  onClick={() => {
                    close();
                    item.onSelect?.();
                  }}
                >
                  {content}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
