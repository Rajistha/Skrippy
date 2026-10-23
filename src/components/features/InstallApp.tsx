"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/id";
import type { InstallPlatform } from "@/lib/pwa";
import { usePwaInstall } from "@/lib/use-pwa-install";

const P = t.pwa;
const SNOOZE_KEY = "skrippy-install-snooze";
const SNOOZE_MS = 14 * 24 * 3_600_000;

/** Tombol "Pasang aplikasi". Tidak tampil bila browser belum menyediakan dialog pasang atau sudah terpasang. */
export function InstallButton({ className }: { className?: string }) {
  const { status, install } = usePwaInstall();
  const [busy, setBusy] = useState(false);
  if (status !== "ready") return null;
  return (
    <Button
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const outcome = await install();
        setBusy(false);
        if (outcome === "accepted") toast.success(P.installedOk);
      }}
    >
      <Icon name="download" /> {P.install}
    </Button>
  );
}

/** Langkah pasang untuk satu perangkat. */
function Steps({ platform, current }: { platform: InstallPlatform; current: boolean }) {
  const info = P.platforms[platform];
  return (
    <section
      className={cn(
        "rounded-xl p-5",
        current ? "bg-primary-50 ring-2 ring-primary-500" : "bg-surface shadow-sm",
      )}
    >
      <h3 className="flex flex-wrap items-center gap-2 text-[16px] font-semibold text-ink-900">
        <Icon name="phone" /> {info.label}
        {current && (
          <span className="rounded-full bg-primary-500 px-2.5 py-0.5 text-[12px] font-semibold text-on-primary">
            {P.yourDevice}
          </span>
        )}
      </h3>
      <ol className="mt-3 flex flex-col gap-2.5">
        {info.steps.map((step, i) => (
          <li key={step} className="flex items-start gap-3 text-[14px] leading-6">
            <span
              aria-hidden="true"
              className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary-100 text-[12px] font-bold text-primary-700"
            >
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Peringatan bila dibuka dari browser dalam aplikasi lain; pemasangan tidak mungkin dari sana. */
export function InAppNotice() {
  const { inApp, status } = usePwaInstall();
  if (!inApp || status === "installed") return null;
  return (
    <Alert tone="warning" title={P.inAppTitle}>
      {P.inAppBody}
    </Alert>
  );
}

/** Seluruh isi halaman /pasang: status, tombol pasang, dan langkah per perangkat (perangkatmu di atas). */
export function InstallGuide() {
  const { status, platform } = usePwaInstall();
  const order: InstallPlatform[] = [platform, ...(["android", "ios", "desktop"] as const)].filter(
    (p, i, all) => all.indexOf(p) === i,
  );
  return (
    <div className="flex flex-col gap-4">
      {status === "installed" ? (
        <Alert tone="success" title={P.installedTitle}>
          {P.installedBody}
        </Alert>
      ) : (
        <>
          <InAppNotice />
          <InstallButton className="self-start" />
        </>
      )}
      <h2 className="mt-2 font-display text-[22px] font-semibold text-ink-900">{P.howTitle}</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {order.map((p) => (
          <Steps key={p} platform={p} current={status !== "unknown" && p === platform} />
        ))}
      </div>
      <p className="flex items-start gap-2 text-[13px] leading-5 text-ink-500">
        <Icon name="lock" className="mt-0.5" /> {P.privacyNote}
      </p>
    </div>
  );
}

function readSnoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

/** Kartu ajakan di dashboard. Hilang bila sudah terpasang, dan bisa ditunda 14 hari. */
export function InstallBanner() {
  const { status, install } = usePwaInstall();
  // Snapshot dari localStorage lewat useSyncExternalStore agar aman dari ketidakcocokan hidrasi.
  const snoozed = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    readSnoozed,
    () => true,
  );
  const [hidden, setHidden] = useState(false);
  if (status === "unknown" || status === "installed" || hidden || snoozed) return null;

  function snooze() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      // Penyimpanan diblokir: cukup sembunyikan selama halaman ini terbuka.
    }
    setHidden(true);
  }

  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-100 text-[22px] text-primary-700">
        <Icon name="phone" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-[17px] font-semibold leading-6 text-ink-900">
          {P.bannerTitle}
        </h2>
        <p className="text-[14px] leading-6 text-ink-500">{P.bannerBody}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {status === "ready" ? (
          <Button
            onClick={async () => {
              const outcome = await install();
              if (outcome === "accepted") toast.success(P.installedOk);
            }}
          >
            <Icon name="download" /> {P.install}
          </Button>
        ) : (
          <ButtonLink href="/pasang">{P.howLink}</ButtonLink>
        )}
        <Button variant="ghost" onClick={snooze}>
          {P.dismiss}
        </Button>
      </div>
    </Card>
  );
}

/** Kartu tetap di Profil: tombol pasang atau tautan ke langkah-langkahnya. */
export function InstallCard() {
  const { status } = usePwaInstall();
  if (status === "unknown") return null;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-display text-[18px] font-semibold text-ink-900">
        <Icon name="phone" /> {P.title}
      </h2>
      {status === "installed" ? (
        <p className="flex items-center gap-2 text-[14px] text-sev-success">
          <Icon name="success" /> {P.installedBody}
        </p>
      ) : (
        <>
          <p className="text-[14px] leading-6 text-ink-500">{P.subtitle}</p>
          <div className="flex flex-wrap items-center gap-3">
            <InstallButton />
            <Link
              href="/pasang"
              className="inline-flex min-h-11 items-center text-[14px] font-semibold text-primary-600 hover:underline"
            >
              {P.howLink}
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}
