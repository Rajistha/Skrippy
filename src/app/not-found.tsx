import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { t } from "@/lib/i18n/id";

export default function NotFound() {
  return (
    <main id="konten" className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <Logo />
        <p className="mt-10 font-display text-[72px] font-bold leading-none text-primary-200">
          404
        </p>
        <h1 className="mt-4 font-display text-[26px] font-bold leading-9 text-ink-900">
          {t.pages.notFoundTitle}
        </h1>
        <p className="mt-2 text-[15px] leading-6">{t.pages.notFoundBody}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/">
            <Icon name="home" /> {t.pages.home}
          </ButtonLink>
          <ButtonLink href="/dashboard" variant="outline">
            {t.pages.dashboard}
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
