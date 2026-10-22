import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { t } from "@/lib/i18n/id";

export const metadata: Metadata = { title: t.privacyPage.title };

export default function PrivacyPage() {
  const p = t.privacyPage;
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="bg-hero">
        <div className="mx-auto flex h-[72px] max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label={t.pages.home}>
            <Logo tone="light" />
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/50 px-5 text-[14px] font-semibold text-white hover:bg-white/10"
          >
            <Icon name="back" /> {p.back}
          </Link>
        </div>
      </header>

      <main id="konten" className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="font-display text-[32px] font-bold leading-10 text-ink-900 sm:text-[40px] sm:leading-[48px]">
          {p.title}
        </h1>
        <p className="mt-2 text-[13px] text-ink-500">{p.updated}</p>
        <p className="mt-6 text-[16px] leading-7">{p.intro}</p>

        <div className="mt-8 flex flex-col gap-4">
          {p.sections.map((s) => (
            <section key={s.title} className="rounded-xl bg-surface p-6 shadow-sm">
              <h2 className="text-[20px] font-semibold leading-7 text-ink-900">{s.title}</h2>
              <ul className="mt-3 flex flex-col gap-3">
                {s.body.map((line) => (
                  <li key={line} className="flex items-start gap-3 text-[15px] leading-6">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-700">
                      <Icon name="done" size={12} strokeWidth={3} />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <ButtonLink href="/" variant="outline" className="mt-10">
          <Icon name="back" /> {p.back}
        </ButtonLink>
      </main>
    </div>
  );
}
