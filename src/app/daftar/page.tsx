"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthShell, AuthTabs } from "@/components/features/AuthShell";
import { PasswordForm } from "@/components/features/PasswordForm";
import { Alert } from "@/components/ui/Alert";
import { GoogleButton } from "@/components/ui/GoogleButton";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api/client";
import { t } from "@/lib/i18n/id";
import { supabaseBrowser } from "@/lib/supabase/client";

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [info, setInfo] = useState<{ days: number; checks: number; trial: boolean } | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    void api.GET("/public/info").then(({ data }) => {
      if (data)
        setInfo({
          days: data.trial_duration_days,
          checks: data.trial_check_limit,
          trial: data.trial_enabled,
        });
    });
  }, []);

  async function google() {
    setGoogleLoading(true);
    const redirect = new URL("/auth/callback", window.location.origin);
    const { error } = await (
      await supabaseBrowser()
    ).auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirect.toString() },
    });
    if (error) {
      setGoogleLoading(false);
      setFailed(t.login.errors.oauth_failed);
    }
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <span className="grid size-16 place-items-center rounded-full bg-primary-50 text-primary-600">
          <Icon name="mail" size={32} />
        </span>
        <h1 className="font-display text-[30px] font-bold leading-10 text-ink-900">
          {t.login.form.checkEmailTitle}
        </h1>
        <p className="text-[15px] leading-6">{t.login.form.checkEmailBody(sentTo)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AuthTabs active="register" />
      <div>
        <h1 className="font-display text-[30px] font-bold leading-10 text-ink-900">
          {t.login.registerTitle}
        </h1>
        {info && (
          <p className="mt-1 text-[15px] leading-6">
            {info.trial
              ? t.login.registerSubtitle(info.days, info.checks)
              : t.login.registerSubtitleNoTrial}
          </p>
        )}
      </div>
      {failed && <Alert tone="error">{failed}</Alert>}
      <PasswordForm
        mode="register"
        next={next}
        onDone={(needsConfirm, email) => {
          if (needsConfirm) setSentTo(email);
          else {
            router.replace("/dashboard");
            router.refresh();
          }
        }}
      />
      <div className="flex items-center gap-3 text-[13px] text-ink-500" role="separator">
        <span className="h-px flex-1 bg-ink-200" />
        {t.login.or}
        <span className="h-px flex-1 bg-ink-200" />
      </div>
      <GoogleButton
        loading={googleLoading}
        label={t.login.signUpOnly}
        onClick={() => void google()}
      />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <AuthShell>
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
