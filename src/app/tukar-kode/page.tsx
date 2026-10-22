"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AuthShell } from "@/components/features/AuthShell";
import { CodeInput } from "@/components/features/CodeInput";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { formatCodeInput, formatDateWib, isCodeComplete, whatsappLink } from "@/lib/format";
import { t } from "@/lib/i18n/id";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Me } from "@/lib/types";

function RedeemFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const fromLink = formatCodeInput(params.get("kode") ?? "");
  const auto = isCodeComplete(fromLink);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<Me | null>(null);
  const [whatsapp, setWhatsapp] = useState("");
  const autoTried = useRef(false);

  useEffect(() => {
    void supabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) setSignedIn(true);
        else
          router.replace(
            `/masuk?next=${encodeURIComponent("/tukar-kode")}${fromLink ? `&kode=${encodeURIComponent(fromLink)}` : ""}`,
          );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void api.GET("/public/info").then(({ data }) => setWhatsapp(data?.whatsapp ?? ""));
  }, []);

  const redeem = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    const { data, error: err, response } = await api.POST("/access/redeem", { body: { code } });
    setLoading(false);
    if (data) {
      setDone(data);
      const kind = data.access.state === "package" ? t.access.package : t.access.trial;
      toast.success(t.toast.redeemed(kind));
    } else {
      const e = toApiError(err);
      setError(response?.status === 429 ? t.redeem.rateLimited : e.message);
    }
  }, []);

  // Kode dari tautan atau dari langkah masuk ditukar otomatis, sekali saja.
  useEffect(() => {
    if (autoTried.current || !auto || !signedIn) return;
    autoTried.current = true;
    void redeem(fromLink);
  }, [auto, fromLink, redeem, signedIn]);

  if (done) {
    const { access } = done;
    const kind = access.state === "package" ? t.access.package : t.access.trial;
    return (
      <div className="flex flex-col gap-6">
        <span className="grid size-16 place-items-center rounded-full bg-sev-success-bg text-sev-success">
          <Icon name="success" size={32} />
        </span>
        <div>
          <h1 className="font-display text-[30px] font-bold leading-10 text-ink-900">
            {t.redeem.doneTitle}
          </h1>
          <p className="mt-1 text-[15px] leading-6">
            {kind}
            {access.ends_at && ` · ${t.redeem.validUntil(formatDateWib(access.ends_at))}`}{" "}
            {access.checks_left !== null
              ? t.access.checksLeft(access.checks_left, access.checks_left)
              : t.access.unlimited}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/skripsi">
            <Icon name="upload" /> {t.redeem.uploadNow}
          </ButtonLink>
          <ButtonLink href="/dashboard" variant="outline">
            {t.redeem.goDashboard}
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (signedIn === null) return <Skeleton className="h-64 w-full" />;

  if (signedIn && auto && !error && !done) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <Skeleton className="size-16 rounded-full" />
        <h1 className="font-display text-[26px] font-bold leading-9 text-ink-900">
          {t.login.redeeming}
        </h1>
        <Skeleton className="h-5 w-3/4" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[30px] font-bold leading-10 text-ink-900">
          {t.redeem.title}
        </h1>
        <p className="mt-1 text-[15px] leading-6">{t.redeem.body}</p>
      </div>
      <CodeInput
        initial={fromLink}
        onSubmit={redeem}
        onChange={() => error && setError(null)}
        error={error}
        loading={loading}
        autoFocus
      />
      {whatsapp && (
        <ButtonLink
          variant="ghost"
          external
          href={whatsappLink(whatsapp, "Halo, aku mau minta kode akses Skrippy.")}
          className="self-start"
        >
          <Icon name="whatsapp" /> {t.landing.requestCode}
        </ButtonLink>
      )}
    </div>
  );
}

export default function RedeemPage() {
  return (
    <AuthShell>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <RedeemFlow />
      </Suspense>
    </AuthShell>
  );
}
