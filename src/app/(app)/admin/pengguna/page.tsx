"use client";

import { useMemo, useState } from "react";
import { AdminGuard } from "@/components/features/AdminGuard";
import { AppShell } from "@/components/features/AppShell";
import { ManagePanel, UserAccessPill } from "@/components/features/UserManagePanel";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { formatDateWib } from "@/lib/format";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";
import { useSession } from "@/lib/session";
import type { AdminUser } from "@/lib/types";

const msg = (e: unknown) => toApiError(e).message;
type SortKey = "joined" | "email" | "checks";

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

  return (
    <AdminGuard>
      <AppShell title={t.nav.adminUsers} description={u.description}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Input
            type="search"
            aria-label={u.search}
            placeholder={u.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs rounded-full"
          />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-[14px] text-ink-500">
              {u.sortBy}
              <Select
                aria-label={u.sortBy}
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="min-h-10 w-auto rounded-full"
              >
                <option value="joined">{u.sortJoined}</option>
                <option value="email">{u.sortEmail}</option>
                <option value="checks">{u.sortChecks}</option>
              </Select>
            </label>
            <Button
              variant="outline"
              className="size-10 min-h-10 px-0"
              aria-label={desc ? u.sortDesc : u.sortAsc}
              onClick={() => setDesc((v) => !v)}
            >
              <Icon name={desc ? "sortDesc" : "sortAsc"} />
            </Button>
          </div>
        </div>

        {error && <ErrorState message={error} onRetry={() => void reload()} />}
        {loading && !data && <ListSkeleton rows={4} className="h-16" />}
        {data && data.length === 0 && (
          <EmptyState icon="users" title={t.admin.noUsers} body={t.admin.usersEmptyBody} />
        )}
        {data && data.length > 0 && users.length === 0 && (
          <p className="rounded-xl bg-surface p-8 text-center text-ink-500 shadow-sm">
            {u.noMatch}
          </p>
        )}

        {users.length > 0 && (
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-xl bg-surface shadow-sm">
            {users.map((x) => {
              const self = x.id === me.profile.id;
              return (
                <li
                  key={x.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[16px] text-ink-900">
                      <span className="truncate">{x.email}</span>
                      {x.role === "superadmin" && (
                        <span className="text-[13px] font-medium text-primary-600">
                          {x.is_owner ? t.adminRole.roleOwner.toLowerCase() : u.adminLabel}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[13px] leading-5 text-ink-500">
                      {[
                        x.full_name,
                        `${u.joined} ${formatDateWib(x.created_at)}`,
                        `${u.thesis}: ${x.thesis_title ?? "-"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <UserAccessPill user={x} />
                    <Button
                      variant="ghost"
                      className="size-10 min-h-10 px-0"
                      aria-label={`${u.manage}: ${x.email}`}
                      onClick={() => setManaging(x.id)}
                    >
                      <Icon name="settings" />
                    </Button>
                    {!self && !x.is_owner ? (
                      <Button
                        variant="ghost"
                        className="size-10 min-h-10 px-0 text-sev-critical"
                        aria-label={`${u.deleteAccount}: ${x.email}`}
                        onClick={() => setDeleting(x)}
                      >
                        <Icon name="trash" />
                      </Button>
                    ) : (
                      <span className="size-10" aria-hidden="true" />
                    )}
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
