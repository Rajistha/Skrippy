"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Pill } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { t } from "@/lib/i18n/id";
import type { AdminUser } from "@/lib/types";
import { isLifetime } from "./Access";

type Role = AdminUser["role"];
const msg = (e: unknown) => toApiError(e).message;

/** Label akses ringkas: Selamanya, Paket · N hari, Trial · N hari, Berakhir, atau Belum ada akses. */
export function UserAccessPill({ user }: { user: AdminUser }) {
  const u = t.usersUi;
  const a = user.access;
  if (a.state === "package" || a.state === "trial") {
    if (isLifetime(a)) {
      return (
        <Pill tone="primary" icon="success">
          {u.lifetime}
        </Pill>
      );
    }
    const days = a.days_left ?? 0;
    return (
      <Pill tone="primary" icon={a.state === "package" ? "package" : "trial"}>
        {a.state === "package" ? u.packageDays(days) : u.trialDays(days)}
      </Pill>
    );
  }
  return (
    <Pill tone="neutral" icon="neutral">
      {a.state === "expired" ? u.expired : u.noAccess}
    </Pill>
  );
}

/** Isi modal "Kelola pengguna": peran akun dan akses aplikasi dalam satu tempat. */
export function ManagePanel({
  user,
  isSelf,
  onChanged,
}: {
  user: AdminUser;
  isSelf: boolean;
  onChanged: () => Promise<void>;
}) {
  const u = t.usersUi;
  const r = t.adminRole;
  const isAdmin = user.role === "superadmin";
  const roleLocked = isSelf || user.is_owner;
  // Admin tidak memakai jatah trial atau paket, jadi pengaturan akses dimatikan untuknya.
  const accessLocked = isAdmin;

  const [role, setRole] = useState<Role>(user.role);
  const [confirmRole, setConfirmRole] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [days, setDays] = useState("7");
  const [busy, setBusy] = useState<"lifetime" | "trial" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveRole() {
    const { error: err } = await api.POST("/admin/users/{user_id}/role", {
      params: { path: { user_id: user.id } },
      body: { role },
    });
    if (err) throw new Error(msg(err));
    toast.success(r.saved);
    await onChanged();
  }

  async function grant(kind: "lifetime" | "trial") {
    const n = Number(days);
    if (kind === "trial" && (!Number.isInteger(n) || n < 1 || n > 365))
      return setError(u.daysInvalid);
    setBusy(kind);
    setError(null);
    const { error: err } = await api.POST("/admin/users/{user_id}/grant", {
      params: { path: { user_id: user.id } },
      body: kind === "lifetime" ? { kind: "lifetime" } : { kind: "trial", days: n },
    });
    setBusy(null);
    if (err) return setError(msg(err));
    toast.success(kind === "lifetime" ? u.lifetimeGranted : u.trialGranted(n));
    await onChanged();
  }

  async function revoke() {
    const { error: err } = await api.POST("/admin/users/{user_id}/stop", {
      params: { path: { user_id: user.id } },
      body: { reason: u.revokeReason },
    });
    if (err) throw new Error(msg(err));
    toast.success(u.accessRevoked);
    await onChanged();
  }

  return (
    <div className="flex flex-col gap-6 pb-2">
      <section aria-labelledby="role-title" className="flex flex-col gap-3">
        <div>
          <h3 id="role-title" className="text-[15px] font-semibold text-ink-900">
            {u.roleTitle}
          </h3>
          <p className="text-[14px] leading-5 text-ink-500">{u.roleBody}</p>
        </div>
        {roleLocked && <Alert tone="info">{user.is_owner ? r.owner : r.self}</Alert>}
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-700">
          {u.roleLabel}
          <span className="flex gap-3">
            <Select
              aria-label={u.roleLabel}
              value={role}
              disabled={roleLocked}
              onChange={(e) => setRole(e.target.value as Role)}
              className="min-w-0 flex-1 rounded-full"
            >
              <option value="user">{r.roleUser}</option>
              <option value="superadmin">{r.roleAdmin}</option>
            </Select>
            <Button
              disabled={roleLocked || role === user.role}
              onClick={() => setConfirmRole(true)}
            >
              {t.common.save}
            </Button>
          </span>
        </label>
      </section>

      <hr className="border-ink-100" />

      <section aria-labelledby="access-title" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 id="access-title" className="text-[15px] font-semibold text-ink-900">
            {u.accessTitle}
          </h3>
          <UserAccessPill user={user} />
        </div>
        {accessLocked && (
          <p className="text-[13px] leading-5 text-ink-500">{r.adminHasNoAccessActions}</p>
        )}
        <Button
          variant="secondary"
          className="w-full justify-start"
          disabled={accessLocked}
          loading={busy === "lifetime"}
          onClick={() => void grant("lifetime")}
        >
          <Icon name="rocket" /> {u.grantLifetime}
        </Button>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-700">
          {u.trialLabel}
          <span className="flex gap-3">
            <Input
              aria-label={u.trialLabel}
              inputMode="numeric"
              value={days}
              disabled={accessLocked}
              onChange={(e) => setDays(e.target.value)}
              className="min-w-0 flex-1 rounded-full"
            />
            <Button
              variant="secondary"
              disabled={accessLocked}
              loading={busy === "trial"}
              onClick={() => void grant("trial")}
            >
              <Icon name="hourglass" /> {u.giveTrial}
            </Button>
          </span>
        </label>
        {error && <Alert tone="error">{error}</Alert>}
        <Button
          variant="danger"
          className="w-full"
          disabled={accessLocked}
          onClick={() => setConfirmRevoke(true)}
        >
          <Icon name="ban" /> {u.revokeAccess}
        </Button>
      </section>

      <ConfirmDialog
        open={confirmRole}
        onClose={() => setConfirmRole(false)}
        icon="admin"
        tone={role === "user" ? "danger" : "primary"}
        title={role === "superadmin" ? r.confirmAdminTitle : r.confirmUserTitle}
        description={
          role === "superadmin" ? r.confirmAdminBody(user.email) : r.confirmUserBody(user.email)
        }
        confirmLabel={t.common.save}
        onConfirm={saveRole}
      />
      <ConfirmDialog
        open={confirmRevoke}
        onClose={() => setConfirmRevoke(false)}
        icon="ban"
        tone="danger"
        title={u.revokeTitle}
        description={u.revokeBody(user.email)}
        confirmLabel={u.revokeAccess}
        onConfirm={revoke}
      />
    </div>
  );
}
