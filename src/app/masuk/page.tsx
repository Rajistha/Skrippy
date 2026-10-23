"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PasswordForm } from "@/components/features/PasswordForm";
import { AuthShell, AuthTabs } from "@/components/features/AuthShell";
import { Alert } from "@/components/ui/Alert";
import { GoogleButton } from "@/components/ui/GoogleButton";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatCodeInput, isCodeComplete } from "@/lib/format";
import { t } from "@/lib/i18n/id";
import { supabaseBrowser } from "@/lib/supabase/client";

function errorMessage(key: string | null): string | null {
  if (!key) return null;
  const known = t.login.errors as Record<string, string>;
  return known[key] ?? t.login.errors.unknown;
}

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const fromLink = formatCodeInput(params.get("kode") ?? "");
  const code = isCodeComplete(fromLink) ? fromLink : "";
  const next = params.get("next");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(errorMessage(params.get("error")));

  async function signIn() {
    setLoading(true);
    setFailed(null);
    const redirect = new URL("/auth/callback", window.location.origin);
    if (code) redirect.searchParams.set("kode", code);
    if (next && next.startsWith("/") && !next.startsWith("//"))
      redirect.searchParams.set("next", next);
    const { error } = await (
      await supabaseBrowser()
    ).auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirect.toString() },
    });
    if (error) {
      setFailed(t.login.errors.oauth_failed);
      setLoading(false);
    }
    // Berhasil: browser dialihkan ke Google, tombol tetap dalam keadaan memproses.
  }

  return (
    <div className="flex flex-col gap-6">
      <AuthTabs active="login" />

      <div>
        <h1 className="font-display text-[30px] font-bold leading-10 text-ink-900">
          {t.login.title}
        </h1>
        <p className="mt-1 text-[15px] leading-6">{t.login.subtitle}</p>
      </div>

      {failed && (
        <Alert tone={params.get("error") === "session_expired" ? "warning" : "error"}>
          {failed}
        </Alert>
      )}

      {code && (
        <p className="flex items-start gap-2 rounded-lg bg-primary-50 p-3 text-[14px] leading-5 text-primary-700">
          <Icon name="success" className="mt-0.5 shrink-0" /> {t.login.codeWaiting(code)}
        </p>
      )}

      <PasswordForm
        mode="login"
        next={next}
        onDone={() => {
          const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
          router.replace(code ? `/tukar-kode?kode=${encodeURIComponent(code)}` : safe);
          router.refresh();
        }}
      />

      <div className="flex items-center gap-3 text-[13px] text-ink-500" role="separator">
        <span className="h-px flex-1 bg-ink-200" />
        {t.login.or}
        <span className="h-px flex-1 bg-ink-200" />
      </div>

      <GoogleButton loading={loading} label={t.login.signInOnly} onClick={() => void signIn()} />

      <p className="text-[13px] leading-5 text-ink-500">
        {t.login.consent}{" "}
        <Link
          href="/privasi"
          className="font-semibold text-primary-600 underline-offset-2 hover:underline"
        >
          {t.login.privacyPolicy}
        </Link>
        .
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
