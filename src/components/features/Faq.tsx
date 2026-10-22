"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Item = { readonly q: string; readonly a: string };

/** Akordeon: satu terbuka dalam satu waktu, bisa dioperasikan dengan keyboard. */
export function Faq({ items }: { items: readonly Item[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div
            key={item.q}
            className={cn(
              "rounded-xl bg-surface shadow-sm ring-1 transition-colors",
              isOpen ? "ring-primary-200" : "ring-ink-100",
            )}
          >
            <h3 className="text-[16px] leading-6">
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-4 px-5 py-3 text-left font-semibold text-ink-900"
                aria-expanded={isOpen}
                aria-controls={`${base}-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                {item.q}
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full transition-colors",
                    isOpen ? "bg-primary-500 text-on-primary" : "bg-primary-50 text-primary-600",
                  )}
                >
                  <Icon name={isOpen ? "minus" : "plus"} />
                </span>
              </button>
            </h3>
            <div id={`${base}-${i}`} hidden={!isOpen} className="px-5 pb-5 text-[15px] leading-6">
              {item.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}
