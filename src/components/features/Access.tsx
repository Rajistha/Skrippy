"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Badge";
import { formatDateWib, whatsappLink } from "@/lib/format";
import { t } from "@/lib/i18n/id";
import type { AccessStatus } from "@/lib/types";
import { useOwnerWhatsapp } from "@/lib/use-owner-whatsapp";

/** Akses pemilik berumur puluhan tahun; tampilkan sebagai tanpa batas waktu. */
export function isLifetime(a: AccessStatus): boolean {
  return (a.days_left ?? 0) > 3650;
}

export function accessLabel(a: AccessStatus): string {
  if (a.state === "package" && isLifetime(a)) return `${t.access.package} · ${t.access.noExpiry}`;
  if (a.state === "package") return `${t.access.package} · ${t.access.daysLeft(a.days_left ?? 0)}`;
  if (a.state === "trial") {
    const left = a.checks_left ?? 0;
    return `${t.access.trial} · ${left} cek tersisa`;
  }
  return a.state === "expired" ? t.access.expired : t.access.none;
}

export function AccessChip({ access }: { access: AccessStatus }) {
  const active = access.state === "package" || access.state === "trial";
  return (
    <Pill
      tone={active ? "primary" : "neutral"}
      icon={access.state === "package" ? "package" : "trial"}
    >
      {accessLabel(access)}
    </Pill>
  );
}

/** Kartu status akses (gradien hero). */
export function AccessCard({ access, total }: { access: AccessStatus; total?: number }) {
  const active = access.state === "package" || access.state === "trial";
  const days = access.days_left ?? 0;
  const maxDays = access.state === "package" ? 30 : 7;
  const pct = active ? Math.min(100, Math.round((days / maxDays) * 100)) : 0;
  return (
    <section aria-label="Status akses" className="bg-hero rounded-xl p-6 text-white shadow-md">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold">
        <Icon name={access.state === "package" ? "package" : "trial"} />
        {access.state === "package"
          ? t.access.package
          : access.state === "trial"
            ? t.access.trial
            : accessLabel(access)}
      </span>
      {active ? (
        <>
          <p className="mt-4 font-display text-[48px] font-bold leading-[56px]">
            {isLifetime(access) ? (
              t.access.noExpiry
            ) : (
              <>
                {days}
                <span className="ml-2 text-[18px] font-semibold">{t.common.days}</span>
              </>
            )}
          </p>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-white/20"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Sisa waktu akses"
          >
            <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 text-[13px] text-white/85">
            {access.ends_at &&
              !isLifetime(access) &&
              `Berlaku sampai ${formatDateWib(access.ends_at)}. `}
            {access.checks_left != null
              ? t.access.checksLeft(access.checks_left, total ?? access.checks_left)
              : t.access.unlimited}
          </p>
        </>
      ) : (
        <p className="mt-4 text-[18px] leading-7">{t.access.expiredBanner}</p>
      )}
    </section>
  );
}

function splitRemaining(endsAt: string | null): { days: number; hours: number } {
  if (!endsAt) return { days: 0, hours: 0 };
  const ms = Math.max(0, new Date(endsAt).getTime() - Date.now());
  const hoursTotal = Math.floor(ms / 3_600_000);
  return { days: Math.floor(hoursTotal / 24), hours: hoursTotal % 24 };
}

/** Kartu hitung mundur akses di dasar sidebar: sisa waktu, jatah cek, dan tombol tukar/perpanjang. */
export function AccessPanel({ access }: { access: AccessStatus }) {
  const s = t.sidebar;
  const active = access.state === "package" || access.state === "trial";
  const { days, hours } = splitRemaining(access.ends_at);
  // Tombol perpanjang baru muncul saat sisa 3 hari atau kurang, jatah cek habis, atau akses tidak aktif.
  const needsRenewal =
    !active || (!isLifetime(access) && days * 24 + hours <= 72) || access.checks_left === 0;
  const maxDays = access.state === "package" ? 30 : 7;
  const pct = active
    ? Math.min(100, Math.round(((days + hours / 24) / Math.max(maxDays, days)) * 100))
    : 0;
  const label =
    access.state === "trial"
      ? s.trialLabel
      : access.state === "package"
        ? s.packageLabel
        : access.state === "expired"
          ? s.expiredLabel
          : s.noneLabel;
  return (
    <section
      aria-label={t.access.title}
      className="bg-hero relative mt-4 overflow-hidden rounded-lg p-4 text-white"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full border border-white/15"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 -left-6 size-24 rounded-full border border-white/10"
      />
      <p className="relative flex items-center gap-1.5 text-[13px] font-semibold text-accent-200">
        <Icon name={access.state === "package" ? "package" : "hourglass"} /> {label}
      </p>
      {active ? (
        <>
          <p className="relative mt-1 font-display text-[20px] font-bold leading-7" aria-live="off">
            {isLifetime(access) ? t.access.noExpiry : s.remaining(days, hours)}
          </p>
          <div
            className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-white/20"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t.access.title}
          >
            <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
          </div>
          <p className="relative mt-2 text-[12px] leading-4 text-white/85">
            {access.ends_at && !isLifetime(access) && `${s.until(formatDateWib(access.ends_at))}. `}
            {access.checks_left !== null ? s.checksLeft(access.checks_left) : s.unlimited}
          </p>
        </>
      ) : (
        <p className="relative mt-1 text-[13px] leading-5 text-white/90">{s.redeemNone}</p>
      )}
      {needsRenewal && (
        <ButtonLink href="/profil" variant="mint" className="relative mt-3 w-full">
          <Icon name="code" /> {active ? s.extend : s.redeem}
        </ButtonLink>
      )}
    </section>
  );
}

/** Banner hanya bila perlu tindakan (docs/DESIGN.md 7.8a). */
export function AccessBanner({ access }: { access: AccessStatus }) {
  const [dismissed, setDismissed] = useState(false);
  const expired = access.state === "expired" || access.state === "none";
  const low =
    (access.state === "trial" || access.state === "package") &&
    ((access.days_left ?? 99) <= 3 || (access.state === "trial" && (access.checks_left ?? 9) <= 1));
  // Nomor pemilik hanya diambil bila banner peringatan memang tampil (hemat satu permintaan per halaman).
  const whatsapp = useOwnerWhatsapp(expired || low);

  if (dismissed && !expired) return null;

  if (expired || low) {
    return (
      <div role="status" className="rounded-lg bg-sev-critical-bg p-4 text-sev-critical">
        <p className="font-semibold">
          <Icon name="major" /> {expired ? t.access.expiredBanner : t.access.lowBanner}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {whatsapp && (
            <ButtonLink
              variant="secondary"
              external
              href={whatsappLink(whatsapp, "Halo, aku mau perpanjang akses Skrippy.")}
            >
              {t.common.contactOwner}
            </ButtonLink>
          )}
          <ButtonLink variant="secondary" href="/profil">
            {t.access.redeemTitle}
          </ButtonLink>
          {!expired && (
            <Button variant="ghost" onClick={() => setDismissed(true)}>
              <Icon name="close" label={t.common.close} />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
