"use client";

import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { AppShell } from "@/components/features/AppShell";
import { DashboardView } from "@/components/features/DashboardView";
import { InstallBanner } from "@/components/features/InstallApp";
import { ErrorState } from "@/components/ui/States";
import { api, toApiError } from "@/lib/api/client";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";
import { useSession } from "@/lib/session";

export default function DashboardPage() {
  const { me } = useSession();
  // Satu permintaan untuk seluruh beranda (sebelumnya tiga berurutan).
  const { data, error, reload } = useAsync(
    async () => unwrap(await api.GET("/dashboard"), (e) => toApiError(e).message),
    [],
  );
  // Nama depan; tanpa nama lengkap pakai bagian email sebelum "@", bukan alamat penuh.
  const name = me.profile.full_name?.trim().split(/\s+/)[0] ?? me.profile.email.split("@")[0] ?? "";

  return (
    <AppShell
      title={t.dashboard.greeting(name)}
      description={t.dashboard.subtitle}
      actions={
        <ButtonLink href={data?.thesis ? `/skripsi/${data.thesis.id}/unggah` : "/skripsi"}>
          <Icon name="plus" /> {t.dashboard.upload}
        </ButtonLink>
      }
    >
      <InstallBanner />
      {error && <ErrorState message={error} onRetry={() => void reload()} />}
      {data ? <DashboardView me={me} data={data} /> : !error && <DashboardSkeleton />}
    </AppShell>
  );
}

/** Kerangka sementara supaya halaman langsung terlihat saat data dimuat. */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={t.common.loading}>
      <div className="h-10 w-48 animate-pulse rounded-md bg-ink-100" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[168px] animate-pulse rounded-xl bg-ink-100" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr_1fr]">
        <div className="h-72 animate-pulse rounded-xl bg-ink-100" />
        <div className="h-72 animate-pulse rounded-xl bg-ink-100" />
        <div className="h-72 animate-pulse rounded-xl bg-ink-100" />
      </div>
    </div>
  );
}
