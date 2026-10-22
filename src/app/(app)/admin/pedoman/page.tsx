"use client";

import { useState } from "react";
import { AdminGuard } from "@/components/features/AdminGuard";
import { AppShell } from "@/components/features/AppShell";
import { Pill } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, EmptyState } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { formatDateWib } from "@/lib/format";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";
import type { AdminGuideline } from "@/lib/schemas";

const TONE = { draft: "neutral", published: "success", archived: "neutral" } as const;
const ICON = { draft: "pencil", published: "done", archived: "ban" } as const;
const msg = (e: unknown) => toApiError(e).message;

export default function AdminGuidelinesPage() {
  const { data, error, loading, reload } = useAsync(
    async () => unwrap(await api.GET("/admin/guidelines"), msg),
    [],
  );
  const [archiving, setArchiving] = useState<AdminGuideline | null>(null);

  async function setStatus(
    g: AdminGuideline,
    status: "draft" | "published" | "archived",
    done: string,
  ) {
    const { error: err } = await api.POST("/admin/guidelines/{guideline_id}/status", {
      params: { path: { guideline_id: g.id } },
      body: { status },
    });
    if (err) throw new Error(msg(err));
    toast.success(done);
    await reload();
  }

  return (
    <AdminGuard>
      <AppShell
        title={t.guidelines.title}
        description={t.guidelines.subtitle}
        actions={
          <ButtonLink href="/admin/pedoman/baru">
            <Icon name="plus" /> {t.guidelines.add}
          </ButtonLink>
        }
      >
        {error && <ErrorState message={error} onRetry={() => void reload()} />}
        {loading && !data && <ListSkeleton rows={3} className="h-24" />}
        {data && data.length === 0 && (
          <EmptyState
            icon="book"
            title={t.guidelines.empty}
            body={t.guidelines.emptyBody}
            action={
              <ButtonLink href="/admin/pedoman/baru">
                <Icon name="plus" /> {t.guidelines.add}
              </ButtonLink>
            }
          />
        )}
        {data && data.length > 0 && (
          <ul className="flex flex-col gap-3">
            {data.map((g) => (
              <li key={g.id}>
                <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-50 text-[20px] text-primary-600">
                      <Icon name="book" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-[17px] font-semibold leading-6 text-ink-900">
                        {g.name}
                      </h2>
                      <p className="text-[13px] leading-5 text-ink-500">
                        {[
                          g.campus_name,
                          t.guidelines.version(g.version),
                          g.citation_style.toUpperCase(),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="text-[13px] leading-5 text-ink-500">
                        {t.guidelines.usedBy(g.thesis_count)} · diubah {formatDateWib(g.updated_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Pill tone={TONE[g.status]} icon={ICON[g.status]}>
                      {t.guidelines.status[g.status]}
                    </Pill>
                    <ButtonLink
                      href={`/admin/pedoman/${g.id}`}
                      variant="outline"
                      className="min-h-10 px-4"
                    >
                      <Icon name="pencil" /> {t.guidelines.edit}
                    </ButtonLink>
                    {g.status === "draft" && (
                      <Button
                        className="min-h-10 px-4"
                        onClick={() => void setStatus(g, "published", t.guidelines.published)}
                      >
                        {t.guidelines.publishAction}
                      </Button>
                    )}
                    {g.status === "published" && (
                      <Button
                        variant="ghost"
                        className="min-h-10 px-4"
                        onClick={() => setArchiving(g)}
                      >
                        {t.guidelines.archiveAction}
                      </Button>
                    )}
                    {g.status === "archived" && (
                      <Button
                        variant="ghost"
                        className="min-h-10 px-4"
                        onClick={() => void setStatus(g, "draft", t.guidelines.savedDraft)}
                      >
                        {t.guidelines.restoreAction}
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <ConfirmDialog
          open={archiving !== null}
          onClose={() => setArchiving(null)}
          icon="ban"
          title={t.guidelines.archiveTitle}
          description={t.guidelines.archiveBody}
          confirmLabel={t.guidelines.archiveAction}
          onConfirm={async () => {
            if (archiving) await setStatus(archiving, "archived", t.guidelines.archived);
          }}
        />
      </AppShell>
    </AdminGuard>
  );
}
