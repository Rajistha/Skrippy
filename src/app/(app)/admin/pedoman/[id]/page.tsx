"use client";

import { useParams } from "next/navigation";
import { AdminGuard } from "@/components/features/AdminGuard";
import { AppShell } from "@/components/features/AppShell";
import { GuidelineEditor } from "@/components/features/GuidelineEditor";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { api, toApiError } from "@/lib/api/client";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";

export default function EditGuidelinePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useAsync(
    async () =>
      unwrap(
        await api.GET("/admin/guidelines/{guideline_id}", {
          params: { path: { guideline_id: id } },
        }),
        (e) => toApiError(e).message,
      ),
    [id],
  );
  return (
    <AdminGuard>
      <AppShell
        title={data?.name ?? t.guidelines.editTitle}
        description={t.guidelines.editSubtitle}
        back={{ href: "/admin/pedoman", label: t.guidelines.title }}
      >
        {error && <ErrorState message={error} onRetry={() => void reload()} />}
        {!data && !error && <ListSkeleton rows={3} className="h-40" />}
        {data && <GuidelineEditor initial={data} />}
      </AppShell>
    </AdminGuard>
  );
}
