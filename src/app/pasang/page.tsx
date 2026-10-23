import type { Metadata } from "next";
import Link from "next/link";
import { InstallGuide } from "@/components/features/InstallApp";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { t } from "@/lib/i18n/id";

export const metadata: Metadata = {
  title: t.pwa.page.metaTitle,
  description: t.pwa.subtitle,
};

/** Halaman publik: manfaat dan cara memasang Skrippy sebagai aplikasi di ponsel atau komputer. */
export default function InstallPage() {
  const p = t.pwa;
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="bg-hero">
        <div className="mx-auto flex h-[72px] max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label={t.pages.home}>
            <Logo tone="light" />
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/50 px-5 text-[14px] font-semibold text-white hover:bg-white/10"
          >
            <Icon name="back" /> {p.page.back}
          </Link>
        </div>
      </header>

      <main id="konten" className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="font-display text-[32px] font-bold leading-10 text-ink-900 sm:text-[40px] sm:leading-[48px]">
          {p.title}
        </h1>
        <p className="mt-3 max-w-2xl text-[16px] leading-7">{p.subtitle}</p>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {p.benefits.map((b) => (
            <li
              key={b.title}
              className="flex items-start gap-4 rounded-xl bg-surface p-5 shadow-sm"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-100 text-[20px] text-primary-700">
                <Icon name={b.icon as IconName} />
              </span>
              <div>
                <h2 className="text-[16px] font-semibold leading-6 text-ink-900">{b.title}</h2>
                <p className="mt-1 text-[14px] leading-6">{b.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-10">
          <InstallGuide />
        </div>
        <p className="mt-8 text-[13px] leading-5 text-ink-500">{p.page.note}</p>
      </main>
    </div>
  );
}
