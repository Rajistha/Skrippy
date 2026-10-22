import Link from "next/link";
import type { ReactNode } from "react";
import { Faq } from "@/components/features/Faq";
import { HeroCode } from "@/components/features/HeroCode";
import { ScoreRing } from "@/components/features/ScoreRing";
import { ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";
import { formatRupiah, whatsappLink } from "@/lib/format";
import { t } from "@/lib/i18n/id";
import { FooterSignIn } from "./FooterSignIn";
import type { PublicInfo } from "@/lib/schemas";
import { ReportMock } from "./ReportMock";
import { SignupLink } from "./SignupLink";

const WRAP = "mx-auto w-full max-w-[1240px] px-4 sm:px-6";
const L = t.landing;

function SectionHead({
  overline,
  title,
  subtitle,
  center = true,
}: {
  overline: string;
  title: string;
  subtitle?: string;
  center?: boolean;
}) {
  return (
    <div className={cn("mx-auto max-w-2xl", center && "text-center")}>
      <p className="text-[12px] font-semibold uppercase leading-4 tracking-[0.12em] text-primary-600">
        {overline}
      </p>
      <h2 className="mt-3 font-display text-[28px] font-bold leading-9 text-ink-900 sm:text-[36px] sm:leading-[44px]">
        {title}
      </h2>
      {subtitle && <p className="mt-3 text-[16px] leading-7">{subtitle}</p>}
    </div>
  );
}

function Check({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <li className="flex items-start gap-3 text-[15px] leading-6">
      <span
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
          light ? "bg-white/15 text-accent-300" : "bg-primary-100 text-primary-700",
        )}
      >
        <Icon name="done" size={12} strokeWidth={3} />
      </span>
      <span>{children}</span>
    </li>
  );
}

// ------------------------------------------------------------------- hero

export function Hero({ trial = true }: { trial?: boolean }) {
  const h = L.hero;
  const trustIcons: IconName[] = ["lock", "shield", "trash"];
  return (
    <section className="bg-hero relative overflow-hidden pb-32 pt-28 text-white sm:pb-40 sm:pt-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -top-32 size-[520px] rounded-full border border-white/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 top-24 size-[300px] rounded-full border border-white/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 bottom-10 size-[380px] rounded-full bg-white/5 blur-3xl"
      />

      <div className={cn(WRAP, "relative grid items-center gap-12 lg:grid-cols-12")}>
        <div className="min-w-0 lg:col-span-7">
          <h1 className="font-display text-[32px] font-bold leading-[1.15] tracking-tight text-white sm:text-[48px] lg:text-[60px]">
            {h.titleBefore} <span className="text-accent-300">{h.titleHighlight}</span>{" "}
            {h.titleAfter}
          </h1>
          <p className="mt-4 max-w-xl text-[16px] leading-7 text-white/90 sm:mt-5 sm:text-[18px] sm:leading-8">
            {h.subtitle}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row">
            <SignupLink variant="mint" className="min-h-12 w-full justify-center px-7 sm:w-auto">
              <Icon name="rocket" /> {trial ? h.primary : t.landing.primaryNoTrial}
            </SignupLink>
            <a
              href="#laporan"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/50 px-7 text-[14px] font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
            >
              <Icon name="play" /> {h.secondary}
            </a>
          </div>

          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-white/85">
            {h.trust.map((item, i) => (
              <li key={item} className="inline-flex items-center gap-2">
                <Icon name={trustIcons[i] ?? "done"} className="text-accent-300" /> {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex min-w-0 justify-center lg:col-span-5 lg:justify-end">
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/15 blur-3xl"
          />
          <div className="relative">
            <ReportMock />
          </div>
        </div>
      </div>

      <svg
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute inset-x-0 -bottom-px h-14 w-full fill-canvas sm:h-24"
      >
        <path d="M0,64 C240,120 480,0 720,48 C960,96 1200,120 1440,40 L1440,120 L0,120 Z" />
      </svg>
    </section>
  );
}

// ------------------------------------------------------------------ fitur

export function Features() {
  const f = L.features;
  return (
    <section id="fitur" className={cn(WRAP, "py-20 sm:py-28")}>
      <SectionHead overline={f.overline} title={f.title} subtitle={f.subtitle} />
      <ul className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {f.items.map((item, i) => {
          const solid = i === 1;
          return (
            <li
              key={item.title}
              className={cn(
                "flex flex-col rounded-xl p-7 transition-transform duration-200 hover:-translate-y-1",
                solid ? "bg-hero text-white shadow-lg" : "bg-surface shadow-sm ring-1 ring-ink-100",
              )}
            >
              <span
                className={cn(
                  "grid size-14 place-items-center rounded-lg text-[26px]",
                  solid ? "bg-white/15 text-accent-300" : "bg-primary-50 text-primary-600",
                )}
              >
                <Icon name={item.icon as IconName} />
              </span>
              <h3
                className={cn(
                  "mt-6 text-[21px] font-semibold leading-7",
                  solid ? "text-white" : "text-ink-900",
                )}
              >
                {item.title}
              </h3>
              <p
                className={cn(
                  "mt-3 text-[15px] leading-6",
                  solid ? "text-white/90" : "text-ink-500",
                )}
              >
                {item.body}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- laporan

export function ReportShowcase() {
  const r = L.report;
  return (
    <section id="laporan" className="bg-primary-50/70 py-20 sm:py-28">
      <div className={cn(WRAP, "grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20")}>
        <div className="relative flex min-w-0 justify-center">
          <div
            aria-hidden="true"
            className="absolute -left-6 -top-6 size-64 rounded-full bg-primary-100 blur-2xl"
          />
          <div className="relative w-full max-w-[460px]">
            <ReportMock />
          </div>
        </div>
        <div>
          <p className="text-[12px] font-semibold uppercase leading-4 tracking-[0.12em] text-primary-600">
            {r.overline}
          </p>
          <h2 className="mt-3 font-display text-[28px] font-bold leading-9 text-ink-900 sm:text-[36px] sm:leading-[44px]">
            {r.title}
          </h2>
          <p className="mt-4 text-[16px] leading-7">{r.body}</p>
          <ul className="mt-6 flex flex-col gap-3">
            {r.points.map((p) => (
              <Check key={p}>{p}</Check>
            ))}
          </ul>
          <SignupLink className="mt-8">
            {r.cta} <Icon name="arrow" />
          </SignupLink>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------- cara kerja

export function HowItWorks() {
  const h = L.how;
  return (
    <section id="cara-kerja" className={cn(WRAP, "py-20 sm:py-28")}>
      <SectionHead overline={h.overline} title={h.title} />
      <ol className="relative mt-14 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-6">
        <div
          aria-hidden="true"
          className="absolute left-[16%] right-[16%] top-8 hidden border-t-2 border-dashed border-primary-200 md:block"
        />
        {h.steps.map((step, i) => (
          <li key={step.title} className="relative flex flex-col items-center text-center">
            <span className="relative grid size-16 place-items-center rounded-full bg-hero text-[26px] text-white shadow-md">
              <Icon name={step.icon as IconName} />
              <span className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-surface text-[12px] font-bold text-primary-700 shadow-sm ring-1 ring-primary-100">
                {i + 1}
              </span>
            </span>
            <h3 className="mt-5 text-[19px] font-semibold leading-7 text-ink-900">{step.title}</h3>
            <p className="mt-2 max-w-xs text-[15px] leading-6">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------- privasi

export function PrivacyBand() {
  const p = L.privacy;
  return (
    <section className={cn(WRAP, "pb-20 sm:pb-28")}>
      <div className="bg-hero relative overflow-hidden rounded-xl p-6 text-white shadow-lg sm:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full border border-white/10"
        />
        <p className="relative text-[12px] font-semibold uppercase leading-4 tracking-[0.12em] text-accent-300">
          {p.overline}
        </p>
        <h2 className="relative mt-3 font-display text-[28px] font-bold leading-9 text-white sm:text-[34px] sm:leading-10">
          {p.title}
        </h2>
        <ul className="relative mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {p.items.map((item) => (
            <li key={item.title}>
              <span className="grid size-11 place-items-center rounded-full bg-white/15 text-[20px] text-accent-300">
                <Icon name={item.icon as IconName} />
              </span>
              <h3 className="mt-4 text-[16px] font-semibold leading-6 text-white">{item.title}</h3>
              <p className="mt-1 text-[14px] leading-5 text-white/85">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ harga

export function Pricing({ info }: { info: PublicInfo }) {
  const p = L.pricing;
  // Tidak ada yang ditawarkan (trial dan paket sama-sama mati): bagian harga disembunyikan.
  if (!info.trial_enabled && !info.package_enabled) return null;
  const buy = info.whatsapp
    ? whatsappLink(info.whatsapp, "Halo, aku mau beli paket Skrippy.")
    : "/masuk";
  const external = Boolean(info.whatsapp);
  return (
    <section id="paket" className="bg-primary-50/70 py-20 sm:py-28">
      <div className={cn(WRAP, "grid grid-cols-1 items-center gap-12 lg:grid-cols-5")}>
        <div className="min-w-0 lg:col-span-2">
          <p className="text-[12px] font-semibold uppercase leading-4 tracking-[0.12em] text-primary-600">
            {p.overline}
          </p>
          <h2 className="mt-3 font-display text-[28px] font-bold leading-9 text-ink-900 sm:text-[36px] sm:leading-[44px]">
            {p.title}
          </h2>
          <p className="mt-4 text-[16px] leading-7">{p.body}</p>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-[13px] font-medium text-ink-700 shadow-sm">
            <Icon name="wallet" className="text-primary-600" /> {p.payments}
          </p>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2 lg:col-span-3">
          {info.trial_enabled && (
            <article className="flex flex-col rounded-xl bg-surface p-7 shadow-sm ring-1 ring-ink-100">
              <h3 className="text-[18px] font-semibold text-ink-900">{p.trial.name}</h3>
              <p className="mt-3 font-display text-[36px] font-bold leading-10 text-ink-900">
                {p.trial.price}
                <span className="ml-2 text-[14px] font-normal text-ink-500">{p.trial.note}</span>
              </p>
              <ul className="mt-6 flex flex-1 flex-col gap-3">
                {p.trial.features(info.trial_check_limit, info.trial_duration_days).map((f) => (
                  <Check key={f}>{f}</Check>
                ))}
              </ul>
              <SignupLink variant="outline" className="mt-8 w-full">
                {p.trial.cta}
              </SignupLink>
            </article>
          )}
          {info.package_enabled && (
            <article className="bg-hero relative flex flex-col rounded-xl p-7 text-white shadow-lg">
              <span className="absolute -top-3 right-6 inline-flex items-center gap-1.5 rounded-full bg-accent-300 px-3 py-1 text-[12px] font-bold text-primary-900 shadow-md">
                <Icon name="star" /> {p.package.badge}
              </span>
              <h3 className="text-[18px] font-semibold text-white">{info.package_name}</h3>
              <p className="mt-3 font-display text-[36px] font-bold leading-10 text-white">
                {formatRupiah(info.package_price_idr)}
                <span className="ml-2 text-[14px] font-normal text-white/85">
                  / {info.package_duration_days} {t.common.days}
                </span>
              </p>
              <ul className="mt-6 flex flex-1 flex-col gap-3">
                {p.package.features.map((f) => (
                  <Check key={f} light>
                    {f}
                  </Check>
                ))}
              </ul>
              <ButtonLink href={buy} external={external} variant="mint" className="mt-8 w-full">
                {p.package.cta}
              </ButtonLink>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------- FAQ

export function FaqSection({ whatsapp }: { whatsapp: string }) {
  const f = L.faq;
  return (
    <section id="faq" className={cn(WRAP, "py-20 sm:py-28")}>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-5 lg:gap-16">
        <div className="min-w-0 lg:col-span-2">
          <SectionHead overline={f.overline} title={f.title} center={false} />
          {whatsapp && (
            <ButtonLink
              href={whatsappLink(whatsapp, "Halo, aku mau tanya soal Skrippy.")}
              external
              variant="outline"
              className="mt-6"
            >
              <Icon name="whatsapp" /> {t.common.contactOwner}
            </ButtonLink>
          )}
        </div>
        <div className="min-w-0 lg:col-span-3">
          <Faq items={f.items} />
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------- banner CTA

export function CtaBanner({ trial = true }: { trial?: boolean }) {
  const c = L.cta;
  return (
    <section className={cn(WRAP, "pb-20 sm:pb-28")}>
      <div className="bg-hero relative overflow-hidden rounded-xl p-6 text-white shadow-lg sm:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-16 size-80 rounded-full border border-white/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-10 -top-16 size-56 rounded-full bg-accent-300/15 blur-3xl"
        />
        <div className="relative grid items-center gap-10 lg:grid-cols-2">
          <div className="flex items-center gap-6">
            <div className="hidden shrink-0 rounded-xl bg-surface p-3 shadow-lg sm:block">
              <ScoreRing value={94} size={104} />
              <p className="-mt-1 text-center text-[12px] font-semibold text-ink-500">{c.sample}</p>
            </div>
            <div>
              <h2 className="font-display text-[28px] font-bold leading-9 text-white sm:text-[34px] sm:leading-10">
                {c.title}
              </h2>
              <p className="mt-3 text-[16px] leading-7 text-white/90">{c.body}</p>
            </div>
          </div>
          <HeroCode trial={trial} />
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------- footer

export function Footer({ whatsapp }: { whatsapp: string }) {
  const f = L.footerBlock;
  const col = "text-[12px] font-semibold uppercase leading-4 tracking-[0.12em] text-accent-300";
  const link = "inline-flex min-h-8 items-center text-[14px] text-white/85 hover:text-white";
  return (
    <footer className="bg-primary-900 text-white/85">
      <div className={cn(WRAP, "grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4")}>
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo tone="light" />
          <p className="mt-4 max-w-xs text-[14px] leading-6">{f.about}</p>
        </div>
        <nav aria-label={f.product}>
          <p className={col}>{f.product}</p>
          <ul className="mt-4 flex flex-col">
            {L.nav.slice(0, 4).map((item) => (
              <li key={item.href}>
                <a href={item.href} className={link}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={f.help}>
          <p className={col}>{f.help}</p>
          <ul className="mt-4 flex flex-col">
            <li>
              <a href="#faq" className={link}>
                FAQ
              </a>
            </li>
            <li>
              <FooterSignIn className={link} />
            </li>
            {whatsapp && (
              <li>
                <a
                  href={whatsappLink(whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={link}
                >
                  {t.common.contactOwner}
                </a>
              </li>
            )}
          </ul>
        </nav>
        <nav aria-label={f.legal}>
          <p className={col}>{f.legal}</p>
          <ul className="mt-4 flex flex-col">
            <li>
              <Link href="/privasi" className={link}>
                {f.privacyPolicy}
              </Link>
            </li>
            <li className="inline-flex min-h-8 items-center gap-2 text-[14px]">
              <Icon name="fileCheck" className="text-accent-300" /> {f.compat}
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/10">
        <div
          className={cn(WRAP, "flex flex-wrap items-center justify-between gap-3 py-5 text-[13px]")}
        >
          <p>{f.rights(new Date().getFullYear())}</p>
          <a href="#" className="inline-flex min-h-8 items-center gap-1.5 hover:text-white">
            <Icon name="arrow" className="-rotate-90" /> {t.common.backToTop}
          </a>
        </div>
      </div>
    </footer>
  );
}
