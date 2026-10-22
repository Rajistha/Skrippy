"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/features/AppShell";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, EmptyState } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { formatBytes, formatDateTimeWib } from "@/lib/format";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";

type Target = { kind: "document"; id: string; label: string } | { kind: "thesis" } | null;

export default function ThesisDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [target, setTarget] = useState<Target>(null);
  const { data, error, loading, reload } = useAsync(
    async () =>
      unwrap(
        await api.GET("/theses/{thesis_id}", { params: { path: { thesis_id: id } } }),
        (e) => toApiError(e).message,
      ),
    [id],
  );

  async function confirmDelete() {
    if (!target) return;
    if (target.kind === "document") {
      const { error: err } = await api.DELETE("/documents/{document_id}", {
        params: { path: { document_id: target.id } },
      });
      if (err) throw new Error(toApiError(err).message);
      toast.success(t.toast.documentDeleted);
      await reload();
    } else {
      const { error: err } = await api.DELETE("/theses/{thesis_id}", {
        params: { path: { thesis_id: id } },
      });
      if (err) throw new Error(toApiError(err).message);
      toast.success(t.toast.thesisDeleted);
      router.replace("/skripsi");
    }
  }

  return (
    <AppShell
      title={data?.title ?? t.nav.theses}
      description={data ? `${t.thesis.versions}: ${data.documents.length}` : undefined}
      back={{ href: "/skripsi", label: t.nav.theses }}
      actions={
        data && (
          <ButtonLink href={`/skripsi/${id}/unggah`}>
            <Icon name="upload" /> {t.thesis.upload}
          </ButtonLink>
        )
      }
    >
      {error && <ErrorState message={error} onRetry={() => void reload()} />}
      {loading && !data && <ListSkeleton rows={3} className="h-28" />}

      {data && (
        <>
          {data.documents.length === 0 ? (
            <EmptyState
              icon="cloudUpload"
              title={t.thesis.noVersions}
              body={t.dashboard.noThesisBody}
              action={
                <ButtonLink href={`/skripsi/${id}/unggah`}>
                  <Icon name="upload" /> {t.thesis.upload}
                </ButtonLink>
              }
            />
          ) : (
            <ol className="relative flex flex-col gap-4 border-l-2 border-primary-100 pl-5 sm:pl-6">
              {data.documents.map((d, i) => (
                <li key={d.id} className="relative">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[27px] top-6 size-3 rounded-full ring-4 ring-canvas sm:-left-[31px] ${i === 0 ? "bg-primary-500" : "bg-primary-200"}`}
                  />
                  <Card className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-[18px] font-semibold leading-7 text-ink-900">
                          {t.thesis.version(d.version_no)}
                          {i === 0 && (
                            <span className="ml-2 rounded-full bg-primary-100 px-2.5 py-0.5 align-middle text-[12px] font-semibold text-primary-700">
                              {t.thesis.latest}
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[13px] leading-5 text-ink-500">
                          {d.original_filename} · {formatBytes(d.size_bytes)} ·{" "}
                          {formatDateTimeWib(d.created_at)}
                        </p>
                      </div>
                      {d.latest_score !== null && (
                        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary-50 font-display text-[20px] font-bold text-primary-700">
                          {Math.round(d.latest_score)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {d.latest_run_id && (
                        <ButtonLink variant="secondary" href={`/laporan/${d.latest_run_id}`}>
                          <Icon name="fileCheck" /> {t.thesis.viewReport}
                        </ButtonLink>
                      )}
                      <ButtonLink variant="outline" href={`/skripsi/${id}/unggah?dokumen=${d.id}`}>
                        <Icon name="play" /> {t.thesis.runCheck}
                      </ButtonLink>
                      <Button
                        variant="ghost"
                        className="text-sev-critical hover:bg-sev-critical-bg"
                        onClick={() =>
                          setTarget({
                            kind: "document",
                            id: d.id,
                            label: t.thesis.version(d.version_no),
                          })
                        }
                      >
                        <Icon name="trash" /> {t.thesis.deleteDoc}
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-4 border-t border-ink-200 pt-6">
            <Button variant="danger" onClick={() => setTarget({ kind: "thesis" })}>
              <Icon name="trash" /> {t.thesis.deleteThesis}
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        tone="danger"
        icon="trash"
        title={target?.kind === "thesis" ? t.thesis.deleteThesisTitle : t.thesis.deleteDocTitle}
        description={target?.kind === "thesis" ? t.thesis.deleteThesisBody : t.thesis.deleteDocBody}
        confirmLabel={target?.kind === "thesis" ? t.thesis.deleteThesis : t.thesis.deleteDoc}
        onConfirm={confirmDelete}
      >
        {target?.kind === "document" && (
          <p className="rounded-md bg-primary-50 px-3 py-2 text-[14px] font-semibold text-ink-900">
            {target.label}
          </p>
        )}
      </ConfirmDialog>
    </AppShell>
  );
}
