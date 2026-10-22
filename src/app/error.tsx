"use client";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { t } from "@/lib/i18n/id";

/** Batas error global. Pesan error teknis tidak ditampilkan (bisa memuat data); hanya digest untuk rujukan. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="konten" className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <Logo />
        <span className="mt-10 grid size-16 place-items-center rounded-full bg-sev-critical-bg text-sev-critical">
          <Icon name="critical" size={30} />
        </span>
        <h1 className="mt-5 font-display text-[26px] font-bold leading-9 text-ink-900">
          {t.pages.errorTitle}
        </h1>
        <p className="mt-2 text-[15px] leading-6">{t.pages.errorBody}</p>
        {error.digest && (
          <p className="mt-3 font-mono text-[12px] text-ink-400">ref: {error.digest}</p>
        )}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button onClick={reset}>
            <Icon name="refresh" /> {t.pages.reload}
          </Button>
          <ButtonLink href="/dashboard" variant="outline">
            {t.pages.dashboard}
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
