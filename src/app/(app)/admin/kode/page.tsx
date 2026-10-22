"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AdminGuard } from "@/components/features/AdminGuard";
import { AppShell } from "@/components/features/AppShell";
import { CreateBatchModal } from "@/components/features/CreateBatchModal";
import { Pill } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { api, toApiError } from "@/lib/api/client";
import { batchTitle } from "@/lib/batch";
import { formatDateWib } from "@/lib/format";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";
import type { BatchSummary } from "@/lib/types";

const msg = (e: unknown) => toApiError(e).message;
const STATUS_TONE = { active: "primary", used: "success", expired: "neutral" } as const;
type SortKey = "date" | "redeemed" | "size";

/** Daftar batch kode: satu baris per batch, klik untuk membuka kode-kodenya. */
export default function AdminCodesPage() {
  const k = t.adminCodes;
  const router = useRouter();
  const { data, error, loading, reload } = useAsync(
    async () => unwrap(await api.GET("/admin/batches"), msg),
    [],
  );
  const [formOpen, setFormOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("date");
  const [desc, setDesc] = useState(true);

  const batches = useMemo(() => {
    const list = [...(data ?? [])];
    const value = (b: BatchSummary): number =>
      sort === "date"
        ? new Date(b.created_at).getTime()
        : sort === "redeemed"
          ? b.redeemed
          : b.total;
    list.sort((a, b) => (desc ? value(b) - value(a) : value(a) - value(b)));
    return list;
  }, [data, sort, desc]);

  return (
    <AdminGuard>
      <AppShell
        title={t.nav.adminCodes}
        description={k.description}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Icon name="plus" /> {k.newBatch}
          </Button>
        }
      >
        {error && <ErrorState message={error} onRetry={() => void reload()} />}
        {loading && !data && <ListSkeleton rows={3} className="h-16" />}
        {data && data.length === 0 && (
          <EmptyState
            icon="code"
            title={k.emptyTitle}
            body={k.emptyBody}
            action={
              <Button onClick={() => setFormOpen(true)}>
                <Icon name="plus" /> {k.newBatch}
              </Button>
            }
          />
        )}
        {batches.length > 1 && (
          <div className="flex items-center justify-end gap-2">
            <label className="flex items-center gap-2 text-[14px] text-ink-500">
              {k.sortBy}
              <Select
                aria-label={k.sortBy}
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="min-h-10 w-auto"
              >
                <option value="date">{k.sortDate}</option>
                <option value="redeemed">{k.sortRedeemed}</option>
                <option value="size">{k.sortSize}</option>
              </Select>
            </label>
            <Button
              variant="outline"
              className="size-10 min-h-10 px-0"
              aria-label={desc ? k.sortDesc : k.sortAsc}
              onClick={() => setDesc((v) => !v)}
            >
              <Icon name={desc ? "sortDesc" : "sortAsc"} />
            </Button>
          </div>
        )}
        {batches.length > 0 && (
          <ul className="flex flex-col gap-3">
            {batches.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/admin/kode/${b.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-full bg-surface px-6 py-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink-900">
                      {batchTitle(b)}
                    </span>
                    <span className="block truncate text-[13px] leading-5 text-ink-500">
                      {[
                        b.note,
                        k.codeCount(b.total),
                        `${k.createdOn} ${formatDateWib(b.created_at)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-[15px] text-ink-900">
                      {k.redeemedOf(b.redeemed, b.capacity)}
                    </span>
                    <Pill tone={STATUS_TONE[b.status]}>{k.batchStatus[b.status]}</Pill>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <CreateBatchModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onCreated={(id) => router.push(`/admin/kode/${id}`)}
        />
      </AppShell>
    </AdminGuard>
  );
}
