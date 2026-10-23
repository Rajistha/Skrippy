"use client";

import { useMemo, useState } from "react";
import { AdminGuard } from "@/components/features/AdminGuard";
import { AppShell } from "@/components/features/AppShell";
import { ManagePanel, UserAccessPill } from "@/components/features/UserManagePanel";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input, Select } from "@/components/ui/Field";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { formatBytes, formatDateWib } from "@/lib/format";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";
import { useSession } from "@/lib/session";
import type { AdminUser } from "@/lib/types";

const msg = (e: unknown) => toApiError(e).message;
type SortKey = "joined" | "email" | "checks" | "storage";

/** Daftar pengguna: cari email, urutkan, atur peran dan akses (satu modal), atau hapus akun. */
export default function AdminUsersPage() {
  const u = t.usersUi;
  const { me } = useSession();
  const { data, error, loading, reload } = useAsync(
    async () => unwrap(await api.GET("/admin/users"), msg),
    [],
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("joined");
  const [desc, setDesc] = useState(true);
  const [managing, setManaging] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);

  const users = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data ?? []).filter(
      (x) =>
        !q || x.email.toLowerCase().includes(q) || (x.full_name ?? "").toLowerCase().includes(q),
    );
    const key = (x: AdminUser): number | string =>
      sort === "joined"
        ? new Date(x.created_at).getTime()
        : sort === "email"
          ? x.email.toLowerCase()
          : sort === "storage"
            ? x.storage_bytes
            : x.checks_used;
    return list.sort((a, b) => {
      const [ka, kb] = [key(a), key(b)];
      const cmp = typeof ka === "string" ? ka.localeCompare(kb as string) : ka - (kb as number);
      return desc ? -cmp : cmp;
    });
  }, [data, query, sort, desc]);

  // Selalu pakai data terbaru dari daftar (peran dan akses berubah setelah disimpan).
  const current = managing ? (data?.find((x) => x.id === managing) ?? null) : null;

  async function remove() {
    if (!deleting) return;
    const { error: err } = await api.DELETE("/admin/users/{user_id}", {
      params: { path: { user_id: deleting.id } },
    });
    if (err) throw new Error(msg(err));
    toast.success(t.adminRole.deleted);
    await reload();
  }

  const totalBytes = (data ?? []).reduce((n, x) => n + x.storage_bytes, 0);
  const totalFiles = (data ?? []).reduce((n, x) => n + x.file_count, 0);
  const maxBytes = Math.max(1, ...(data ?? []).map((x) => x.storage_bytes));
  const summary: [string, string, IconName][] = [
    [u.summaryUsers, String(data?.length ?? 0), "users"],
    [u.summaryStorage, formatBytes(totalBytes), "database"],
    [u.summaryFiles, String(totalFiles), "thesis"],
  ];

  return (
    <AdminGuard>
      <AppShell title={t.nav.adminUsers} description={u.description}>
        {data && data.length > 0 && (
          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            {summary.map(([label, value, icon]) => (
              <div key={label} className="min-w-0 rounded-xl bg-surface p-3 shadow-sm sm:p-4">
                <dt className="flex items-center gap-1.5 text-[12px] leading-4 text-ink-500 sm:text-[13px]">
                  <Icon name={icon} className="text-primary-500" />
                  <span className="truncate">{label}</span>
                </dt>
                <dd className="mt-1 truncate font-display text-[20px] font-semibold leading-7 text-ink-900 sm:text-[24px] sm:leading-8">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <Input
            type="search"
            aria-label={u.search}
            placeholder={u.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-full sm:max-w-xs"
          />
          <div className="flex items-center gap-2">
            <Select
              aria-label={u.sortBy}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="min-h-10 min-w-0 flex-1 rounded-full sm:w-auto sm:flex-none"
            >
              <option value="joined">{`${u.sortBy}: ${u.sortJoined}`}</option>
              <option value="email">{`${u.sortBy}: ${u.sortEmail}`}</option>
              <option value="checks">{`${u.sortBy}: ${u.sortChecks}`}</option>
              <option value="storage">{`${u.sortBy}: ${u.sortStorage}`}</option>
            </Select>
            <Button
              variant="outline"
              className="size-10 min-h-10 shrink-0 px-0"
              aria-label={desc ? u.sortDesc : u.sortAsc}
              onClick={() => setDesc((v) => !v)}
            >
              <Icon name={desc ? "sortDesc" : "sortAsc"} />
            </Button>
          </div>
        </div>

        {error && <ErrorState message={error} onRetry={() => void reload()} />}
        {loading && !data && <ListSkeleton rows={4} className="h-24" />}
        {data && data.length === 0 && (
          <EmptyState icon="users" title={t.admin.noUsers} body={t.admin.usersEmptyBody} />
        )}
        {data && data.length > 0 && users.length === 0 && (
          <p className="rounded-xl bg-surface p-8 text-center text-ink-500 shadow-sm">
            {u.noMatch}
          </p>
        )}

        {users.length > 0 && (
          <ul className="flex flex-col gap-3">
            {users.map((x) => {
              const self = x.id === me.profile.id;
              const label = x.full_name ?? x.email;
              const share =
                x.storage_bytes > 0 ? Math.max(3, (x.storage_bytes / maxBytes) * 100) : 0;
              return (
                <li key={x.id} className="rounded-xl bg-surface p-4 shadow-sm sm:p-5">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-100 text-[15px] font-semibold text-primary-700"
                    >
                      {label.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-2 text-[15px] leading-6 text-ink-900 sm:text-[16px]">
                        <span className="truncate font-medium">{x.email}</span>
                        {x.role === "superadmin" && (
                          <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-[12px] font-semibold leading-4 text-primary-700">
                            {x.is_owner ? t.adminRole.roleOwner.toLowerCase() : u.adminLabel}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[13px] leading-5 text-ink-500">
                        {[x.full_name, `${u.joined} ${formatDateWib(x.created_at)}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="-mr-2 -mt-1 flex shrink-0 items-center">
                      <Button
                        variant="ghost"
                        className="size-11 min-h-11 px-0"
                        aria-label={`${u.manage}: ${x.email}`}
                        onClick={() => setManaging(x.id)}
                      >
                        <Icon name="settings" />
                      </Button>
                      {!self && !x.is_owner && (
                        <Button
                          variant="ghost"
                          className="size-11 min-h-11 px-0 text-sev-critical"
                          aria-label={`${u.deleteAccount}: ${x.email}`}
                          onClick={() => setDeleting(x)}
                        >
                          <Icon name="trash" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 border-t border-ink-100 pt-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,14rem)] sm:items-center sm:gap-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <UserAccessPill user={x} />
                      <span className="text-[13px] text-ink-500">{u.checks(x.checks_used)}</span>
                    </div>
                    <p className="flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-ink-500">
                      <Icon name="thesis" />
                      <span className="truncate">{x.thesis_title ?? u.noThesis}</span>
                    </p>
                    <div>
                      <div className="flex items-baseline justify-between gap-2 text-[13px] leading-5">
                        <span className="font-semibold text-ink-900">
                          {x.storage_bytes > 0 ? formatBytes(x.storage_bytes) : u.storageEmpty}
                        </span>
                        {x.file_count > 0 && (
                          <span className="text-ink-500">{u.files(x.file_count)}</span>
                        )}
                      </div>
                      <div
                        role="meter"
                        aria-label={`${u.storage}: ${x.email}`}
                        aria-valuemin={0}
                        aria-valuemax={maxBytes}
                        aria-valuenow={x.storage_bytes}
                        className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100"
                      >
                        <div
                          className="h-full rounded-full bg-primary-500"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <Modal
          open={current !== null}
          onClose={() => setManaging(null)}
          title={u.manageTitle}
          description={
            current
              ? `${current.full_name ? `${current.full_name} · ` : ""}${current.email}`
              : undefined
          }
        >
          {current && (
            <ManagePanel
              key={current.id}
              user={current}
              isSelf={current.id === me.profile.id}
              onChanged={async () => {
                await reload();
              }}
            />
          )}
        </Modal>

        <ConfirmDialog
          open={deleting !== null}
          onClose={() => setDeleting(null)}
          tone="danger"
          icon="trash"
          title={u.deleteTitle}
          description={t.adminRole.deleteBody}
          confirmLabel={u.deleteAccount}
          onConfirm={remove}
        >
          {deleting && (
            <p className="rounded-md bg-primary-50 px-3 py-2 text-[14px] font-semibold text-ink-900">
              {deleting.email}
            </p>
          )}
        </ConfirmDialog>
      </AppShell>
    </AdminGuard>
  );
}
