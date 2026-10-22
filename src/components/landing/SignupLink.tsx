"use client";

import type { ReactNode } from "react";
import { ButtonLink, type ButtonVariant } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { t } from "@/lib/i18n/id";
import { useSignedIn } from "@/lib/use-signed-in";

/** Tombol ajakan daftar; setelah masuk berubah menjadi "Ke dashboard". */
export function SignupLink({
  children,
  variant,
  className,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
}) {
  const signedIn = useSignedIn();
  return (
    <ButtonLink href={signedIn ? "/dashboard" : "/daftar"} variant={variant} className={className}>
      {signedIn ? (
        <>
          <Icon name="dashboard" /> {t.landing.goDashboard}
        </>
      ) : (
        children
      )}
    </ButtonLink>
  );
}
