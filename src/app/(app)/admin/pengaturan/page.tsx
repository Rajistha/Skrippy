"use client";

import { AdminGuard } from "@/components/features/AdminGuard";
import { AiSettings } from "@/components/features/AiSettings";
import { SettingsForm } from "@/components/features/SettingsForm";
import { AppShell } from "@/components/features/AppShell";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { api, toApiError } from "@/lib/api/client";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";

const msg = (e: unknown) => toApiError(e).message;

export default function AdminSettingsPage() {
  const { data, error, loading, reload } = useAsync(
    async () => unwrap(await api.GET("/admin/settings"), msg),
    [],
  );
  const ai = useAsync(async () => unwrap(await api.GET("/admin/ai"), msg), []);
  return (
    <AdminGuard>
      <AppShell
        title={t.nav.adminSettings}
        description="Nilai bawaan untuk trial, paket, dan kontak pemilik. Setiap kotak punya tombol simpan sendiri."
      >
        {error && <ErrorState message={error} onRetry={() => void reload()} />}
        {loading && !data && <ListSkeleton rows={2} className="h-40" />}
        {data && <SettingsForm initial={data.values} />}
        {ai.data && <AiSettings initial={ai.data} />}
        {ai.error && <ErrorState message={ai.error} onRetry={() => void ai.reload()} />}
      </AppShell>
    </AdminGuard>
  );
}
