"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/id";
import { useSignedIn } from "@/lib/use-signed-in";

/** Navbar tetap di atas: transparan di atas hero, putih berbayang setelah digulir. Menu lengkap di ponsel. */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const signedIn = useSignedIn();
  const entryHref = signedIn ? "/dashboard" : "/masuk";
  const entryLabel = signedIn ? t.landing.goDashboard : t.landing.signIn;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-all duration-200",
        scrolled ? "bg-surface/95 shadow-sm backdrop-blur" : "bg-transparent",
      )}
    >
      <nav
        aria-label={t.nav.mainMenu}
        className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6"
      >
        <Link href="/" aria-label={t.pages.home}>
          <Logo tone={scrolled ? "dark" : "light"} />
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {t.landing.nav.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className={cn(
                  "text-[14px] font-medium transition-colors",
                  scrolled
                    ? "text-ink-700 hover:text-primary-600"
                    : "text-white/85 hover:text-white",
                )}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link
            href={entryHref}
            className={cn(
              "inline-flex min-h-11 items-center justify-center rounded-full px-6 text-[14px] font-semibold transition-colors",
              scrolled
                ? "bg-primary-500 text-on-primary hover:bg-primary-600"
                : "bg-white text-primary-700 hover:bg-primary-50",
            )}
          >
            {entryLabel}
          </Link>
          <button
            type="button"
            aria-label={t.common.openMenu}
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            className={cn(
              "grid size-11 place-items-center rounded-full md:hidden",
              scrolled ? "text-ink-900 hover:bg-primary-50" : "text-white hover:bg-white/10",
            )}
          >
            <Icon name="menu" size={22} />
          </button>
        </div>
      </nav>

      <Modal open={open} onClose={() => setOpen(false)} title={t.nav.mainMenu} size="sm">
        <div className="mb-2 flex items-center justify-between border-b border-ink-100 pb-3">
          <Logo />
        </div>
        <ul className="flex flex-col gap-1 pb-4">
          {t.landing.nav.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center justify-between rounded-md px-3 text-[16px] font-medium text-ink-900 hover:bg-primary-50"
              >
                {item.label}
                <Icon name="chevronRight" className="text-ink-400" />
              </a>
            </li>
          ))}
          <li className="pt-3">
            <ButtonLink href={entryHref} className="w-full">
              {entryLabel}
            </ButtonLink>
          </li>
        </ul>
      </Modal>
    </header>
  );
}
