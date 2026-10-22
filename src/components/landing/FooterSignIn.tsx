"use client";

import Link from "next/link";
import { t } from "@/lib/i18n/id";
import { useSignedIn } from "@/lib/use-signed-in";

export function FooterSignIn({ className }: { className?: string }) {
  const signedIn = useSignedIn();
  return (
    <Link href={signedIn ? "/dashboard" : "/masuk"} className={className}>
      {signedIn ? t.landing.goDashboard : t.landing.signIn}
    </Link>
  );
}
