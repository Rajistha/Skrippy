"use client";

import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { t } from "@/lib/i18n/id";

/** Kartu ajakan di hero dan banner CTA: daftar, trial langsung aktif. */
export function HeroCode({ trial = true }: { trial?: boolean }) {
  const h = t.landing.hero;
  const title = trial ? h.codeTitle : t.landing.codeTitleNoTrial;
  const hint = trial ? h.codeHint : t.landing.codeHintNoTrial;
  return (
    <div className="w-full rounded-xl bg-surface p-5 text-left shadow-lg">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-600">
          <Icon name="rocket" size={20} />
        </span>
        <div className="leading-5">
          <p className="text-[15px] font-semibold text-ink-900">{title}</p>
          <p className="text-[13px] text-ink-500">{hint}</p>
        </div>
      </div>
      <ButtonLink href="/daftar" variant="cta" className="w-full">
        {trial ? h.primary : t.landing.primaryNoTrial} <Icon name="arrow" />
      </ButtonLink>
    </div>
  );
}
