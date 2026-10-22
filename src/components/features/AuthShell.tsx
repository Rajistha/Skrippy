import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { t } from "@/lib/i18n/id";

/** Tab Masuk / Tukar kode di atas formulir (dua halaman terpisah). */
export function AuthTabs({ active }: { active: "login" | "register" }) {
  const items = [
    { key: "login", href: "/masuk", label: t.login.tabLogin },
    { key: "register", href: "/daftar", label: t.login.tabRegister },
  ] as const;
  return (
    <nav
      aria-label={t.login.title}
      className="grid grid-cols-2 gap-1 rounded-full bg-primary-50 p-1"
    >
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={active === i.key ? "page" : undefined}
          className={
            "grid min-h-11 place-items-center rounded-full text-[14px] font-semibold transition-colors " +
            (active === i.key
              ? "bg-surface text-ink-900 shadow-sm"
              : "text-ink-500 hover:text-ink-900")
          }
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** Kerangka halaman masuk dan tukar kode: panel merek di kiri (layar lebar), formulir di kanan. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <aside className="bg-hero relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full border border-white/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-20 size-[360px] rounded-full border border-white/10"
        />
        <Link href="/" aria-label={t.pages.home} className="relative w-fit">
          <Logo tone="light" />
        </Link>

        <div className="relative max-w-lg">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-accent-200">
            {t.login.eyebrow}
          </p>
          <h1 className="mt-3 font-display text-[36px] font-bold leading-[44px] text-white">
            {t.login.brandTitle}
          </h1>
          <ul className="mt-6 flex flex-col gap-3">
            {t.login.benefits.map((b) => (
              <li key={b} className="flex items-center gap-3 text-[15px] leading-6 text-white/90">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-accent-300">
                  <Icon name="done" size={14} strokeWidth={3} />
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main id="konten" className="flex min-h-dvh flex-col px-5 py-8 sm:px-10">
        <Link href="/" aria-label={t.pages.home} className="mb-8 w-fit lg:hidden">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          {children}
        </div>
      </main>
    </div>
  );
}
