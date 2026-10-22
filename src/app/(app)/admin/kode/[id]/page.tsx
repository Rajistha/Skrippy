"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AdminGuard } from "@/components/features/AdminGuard";
import { AppShell } from "@/components/features/AppShell";
import { Pill } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CopyButton } from "@/components/ui/CopyButton";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { batchTitle } from "@/lib/batch";
import { formatDateWib } from "@/lib/format";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";
import type { BatchCode, BatchDetail } from "@/lib/types";

const msg = (e: unknown) => toApiError(e).message;
const STATUS_TONE = {
  active: "primary",
  used: "success",
  expired: "neutral",
  revoked: "neutral",
} as const;

/** Unduh seluruh kode batch sebagai CSV (dibuat di browser). */
function downloadCsv(detail: BatchDetail) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [
    ["kode", "dipakai", "kuota", "status", "penebus"],
    ...detail.codes.map((c) => [
      c.code ?? `…${c.code_hint}`,
      String(c.redemption_count),
      String(c.max_redemptions),
      t.adminCodes.codeStatus[c.status],
      c.redeemed_by.join(" "),
    ]),
  ];
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kode-akses-${batchTitle(detail.batch).toLowerCase().replace(/\s+/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Isi satu batch: daftar kode dengan pencarian, salin, ekspor CSV, dan cabut. */
export default function BatchDetailPage() {
  const k = t.adminCodes;
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useAsync(
    async () =>
      unwrap(
        await api.GET("/admin/batches/{batch_id}", { params: { path: { batch_id: id } } }),
        msg,
      ),
    [id],
  );
  const [query, setQuery] = useState("");
  const [removingCode, setRemovingCode] = useState<BatchCode | null>(null);
  const [removingBatch, setRemovingBatch] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!data || !q) return data?.codes ?? [];
    return data.codes.filter(
      (c) =>
        (c.code ?? "").toLowerCase().includes(q) ||
        c.redeemed_by.some((e) => e.toLowerCase().includes(q)),
    );
  }, [data, query]);

  async function removeCode() {
    if (!removingCode) return;
    const { data: res, error: err } = await api.DELETE("/admin/codes/{code_id}", {
      params: { path: { code_id: removingCode.id } },
    });
    if (!res) throw new Error(msg(err));
    toast.success(k.deleted(res.users_affected));
    // Batch yang kodenya habis ikut hilang: kembali ke daftar.
    if (data && data.codes.length <= 1) return router.replace("/admin/kode");
    await reload();
  }

  async function removeBatch() {
    const { data: res, error: err } = await api.DELETE("/admin/batches/{batch_id}", {
      params: { path: { batch_id: id } },
    });
    if (!res) throw new Error(msg(err));
    toast.success(k.batchDeleted(res.codes_deleted, res.users_affected));
    router.replace("/admin/kode");
  }

  const batch = data?.batch;
  return (
    <AdminGuard>
      <AppShell
        title={batch ? batchTitle(batch) : t.nav.adminCodes}
        description={
          batch
            ? [
                batch.note,
                k.codeCount(batch.total),
                `${k.createdOn} ${formatDateWib(batch.created_at)}`,
              ]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        back={{ href: "/admin/kode", label: k.allBatches }}
        actions={
          data && (
            <>
              <Button variant="outline" onClick={() => downloadCsv(data)}>
                <Icon name="download" /> {k.exportCsv}
              </Button>
              {batch?.number !== null && (
                <Button variant="dangerSolid" onClick={() => setRemovingBatch(true)}>
                  <Icon name="ban" /> {k.revokeBatch}
                </Button>
              )}
            </>
          )
        }
      >
        {error && <ErrorState message={error} onRetry={() => void reload()} />}
        {loading && !data && <ListSkeleton rows={4} className="h-14" />}
        {data && (
          <div className="overflow-hidden rounded-xl bg-surface shadow-sm">
            <div className="border-b border-ink-100 p-4">
              <Input
                type="search"
                aria-label={k.searchPlaceholder}
                placeholder={k.searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="max-w-md rounded-full"
              />
            </div>
            {shown.length === 0 ? (
              <p className="px-6 py-10 text-center text-ink-500">{k.noMatch}</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {shown.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-6 py-3"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="break-all font-mono text-[15px] font-semibold tracking-wide text-ink-900">
                        {c.code ?? `…${c.code_hint}`}
                      </span>
                      {c.code && (
                        <CopyButton
                          iconOnly
                          text={c.code}
                          label={t.admin.copyCode}
                          variant="ghost"
                        />
                      )}
                      {c.redeemed_by.length > 0 && (
                        <span className="truncate text-[13px] text-ink-500">
                          {c.redeemed_by.join(", ")}
                        </span>
                      )}
                      {c.code === null && (
                        <span className="text-[13px] text-ink-500">{k.legacy}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-[14px] text-ink-500">
                        {c.redemption_count}/{c.max_redemptions}
                      </span>
                      <Pill tone={STATUS_TONE[c.status]}>{k.codeStatus[c.status]}</Pill>
                      <Button
                        variant="ghost"
                        className="size-10 min-h-10 px-0"
                        aria-label={k.revokeCode}
                        onClick={() => setRemovingCode(c)}
                      >
                        <Icon name="ban" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ConfirmDialog
          open={removingCode !== null}
          onClose={() => setRemovingCode(null)}
          tone="danger"
          icon="ban"
          title={k.deleteTitle}
          description={
            removingCode && removingCode.redemption_count > 0
              ? k.deleteUsed(removingCode.redemption_count)
              : k.deleteBody
          }
          confirmLabel={k.revokeCode}
          onConfirm={removeCode}
        >
          {removingCode && (
            <p className="rounded-md bg-primary-50 px-3 py-2 font-mono text-[14px] font-semibold text-ink-900">
              {removingCode.code ?? `…${removingCode.code_hint}`}
            </p>
          )}
        </ConfirmDialog>

        <ConfirmDialog
          open={removingBatch}
          onClose={() => setRemovingBatch(false)}
          tone="danger"
          icon="ban"
          title={k.revokeBatchTitle}
          description={k.revokeBatchBody(batch?.total ?? 0, batch?.redeemed ?? 0)}
          confirmLabel={k.revokeBatch}
          onConfirm={removeBatch}
        />
      </AppShell>
    </AdminGuard>
  );
}
