"use client";

import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { AppShell } from "@/components/features/AppShell";
import { RunList } from "@/components/features/RunList";
import { EmptyState } from "@/components/ui/Card";
import { api, toApiError } from "@/lib/api/client";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";

export default function HistoryPage() {
  const { data, error, reload } = useAsync(
    async () => unwrap(await api.GET("/checks"), (e) => toApiError(e).message),
    [],
  );
  return (
    <AppShell title={t.nav.history} description={t.pageDesc.history}>
      {error && <ErrorState message={error} onRetry={() => void reload()} />}
      {!data && !error && <ListSkeleton rows={3} />}
      {data && data.length === 0 && (
        <EmptyState title={t.dashboard.noChecks} body={t.dashboard.noThesisBody} />
      )}
      {data && data.length > 0 && <RunList runs={data} />}
    </AppShell>
  );
}
