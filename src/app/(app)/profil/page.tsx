"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccessCard } from "@/components/features/Access";
import { AppShell } from "@/components/features/AppShell";
import { CodeInput } from "@/components/features/CodeInput";
import { IgnoredList } from "@/components/features/IgnoredList";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { formatRupiah, whatsappLink } from "@/lib/format";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";
import { useSession } from "@/lib/session";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function AccessPage() {
  const router = useRouter();
  const { me, refresh } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { data: info } = useAsync(
    async () => unwrap(await api.GET("/public/info"), (e) => toApiError(e).message),
    [],
  );

  async function redeem(code: string) {
    setLoading(true);
    setError(null);
    const { data, error: err, response } = await api.POST("/access/redeem", { body: { code } });
    setLoading(false);
    if (data) {
      const kind = data.access.state === "package" ? t.access.package : t.access.trial;
      toast.success(t.toast.redeemed(kind));
      await refresh();
    } else {
      setError(response?.status === 429 ? t.redeem.rateLimited : toApiError(err).message);
    }
  }

  async function deleteAccount() {
    const { error: err } = await api.DELETE("/me");
    if (err) throw new Error(toApiError(err).message);
    await supabaseBrowser().auth.signOut();
    toast.success(t.toast.accountDeleted);
    router.replace("/");
  }

  return (
    <AppShell title={t.access.title} description="Akun, masa akses, dan penukaran kode.">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex items-center gap-4">
            {me.profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={me.profile.avatar_url}
                alt=""
                referrerPolicy="no-referrer"
                className="size-16 rounded-full object-cover"
              />
            ) : (
              <span className="grid size-16 place-items-center rounded-full bg-primary-100 text-[22px] font-semibold text-primary-700">
                {(me.profile.full_name ?? me.profile.email).slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-[20px] font-semibold leading-7 text-ink-900">
                {me.profile.full_name ?? me.profile.email}
              </h2>
              <p className="truncate text-[14px] text-ink-500">{me.profile.email}</p>
            </div>
          </Card>
          <Card className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-50 text-[20px] text-primary-600">
                <Icon name="code" />
              </span>
              <div>
                <h2 className="text-[20px] font-semibold leading-7 text-ink-900">
                  {t.access.redeemTitle}
                </h2>
                <p className="text-[14px] leading-5">{t.redeem.body}</p>
              </div>
            </div>
            <CodeInput
              onSubmit={redeem}
              onChange={() => error && setError(null)}
              error={error}
              loading={loading}
              hideLabel
            />
          </Card>
          <IgnoredList />
          <Card className="flex flex-col gap-3 ring-1 ring-sev-critical/20">
            <h2 className="text-[18px] font-semibold leading-7 text-ink-900">
              {t.deleteAccount.title}
            </h2>
            <p className="text-[14px] leading-5">{t.deleteAccount.body}</p>
            <Button variant="danger" className="self-start" onClick={() => setDeleting(true)}>
              <Icon name="trash" /> {t.deleteAccount.trigger}
            </Button>
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <AccessCard access={me.access} />
          {info?.package_enabled && (
            <div className="bg-hero relative overflow-hidden rounded-xl p-6 text-white shadow-sm">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full border border-white/15"
              />
              <p className="relative text-[12px] font-semibold uppercase tracking-[0.12em] text-accent-300">
                {t.landing.pricing.overline}
              </p>
              <h2 className="relative mt-1 text-[22px] font-semibold leading-8 text-white">
                {info.package_name}
              </h2>
              <p className="relative mt-1 font-display text-[34px] font-bold leading-10 text-white">
                {formatRupiah(info.package_price_idr)}
                <span className="ml-2 text-[15px] font-normal text-white/85">
                  / {info.package_duration_days} {t.common.days}
                </span>
              </p>
              <p className="relative mt-1 flex items-center gap-2 text-[14px] text-white/90">
                <Icon name="done" className="text-accent-300" /> {t.access.unlimited}
              </p>
              {info.whatsapp && (
                <ButtonLink
                  external
                  variant="mint"
                  href={whatsappLink(info.whatsapp, "Halo, aku mau beli paket Skrippy.")}
                  className="relative mt-4"
                >
                  <Icon name="whatsapp" /> {t.common.contactOwner}
                </ButtonLink>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        tone="danger"
        icon="trash"
        title={t.deleteAccount.title}
        description={t.deleteAccount.body}
        confirmLabel={t.deleteAccount.confirm}
        onConfirm={deleteAccount}
      />
    </AppShell>
  );
}
