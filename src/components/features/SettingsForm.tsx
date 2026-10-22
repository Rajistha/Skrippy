"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { FormSection } from "@/components/ui/FormSection";
import { SwitchRow } from "@/components/ui/Switch";
import { Icon, type IconName } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { t } from "@/lib/i18n/id";

const msg = (e: unknown) => toApiError(e).message;

type Kind = "number" | "text" | "switch";
type FieldDef = { key: string; label: string; kind: Kind; hint?: string };

const FIELDS: FieldDef[] = [
  {
    key: "trial.enabled",
    label: "Berikan trial ke akun baru",
    kind: "switch",
    hint: "Menyala: akun baru langsung dapat trial. Mati: akun baru harus memasukkan kode akses dulu, halaman lain terkunci.",
  },
  { key: "trial.duration_days", label: "Durasi (hari)", kind: "number" },
  { key: "trial.check_limit", label: "Jumlah cek", kind: "number" },
  { key: "trial.daily_check_limit", label: "Batas cek per hari", kind: "number" },
  {
    key: "package.enabled",
    label: "Tawarkan paket berbayar",
    kind: "switch",
    hint: "Mati: paket dan harga tidak ditampilkan di landing dan halaman Profil pengguna. Kamu tetap bisa membuat dan membagikan kode akses dari panel admin.",
  },
  { key: "package.name", label: "Nama paket", kind: "text" },
  { key: "package.price_idr", label: "Harga (Rp)", kind: "number" },
  { key: "package.duration_days", label: "Durasi (hari)", kind: "number" },
  { key: "package.daily_check_limit", label: "Batas wajar cek per hari", kind: "number" },
  {
    key: "contact.whatsapp",
    label: "Nomor WhatsApp pemilik",
    kind: "text",
    hint: "Format 62812xxxxxxx, tanpa tanda +.",
  },
];

type Group = { title: string; description: string; icon: IconName; keys: string[] };
const GROUPS: Group[] = [
  {
    title: "Trial",
    description:
      "Nyalakan untuk memberi jatah gratis ke akun baru. Bila dimatikan, akses hanya lewat kode.",
    icon: "trial",
    keys: ["trial.enabled", "trial.duration_days", "trial.check_limit", "trial.daily_check_limit"],
  },
  {
    title: "Paket berbayar",
    description: "Nama, harga, dan batas pemakaian paket yang dijual lewat kode.",
    icon: "package",
    keys: [
      "package.enabled",
      "package.name",
      "package.price_idr",
      "package.duration_days",
      "package.daily_check_limit",
    ],
  },
  {
    title: "Kontak",
    description: "Nomor WhatsApp pemilik untuk pembelian dan permintaan kode.",
    icon: "code",
    keys: ["contact.whatsapp"],
  },
];

export function SettingsForm({ initial }: { initial: Record<string, unknown> }) {
  // Nilai dipegang di sini agar peringatan "trial dan paket sama-sama mati" ikut berubah saat saklar digeser.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v ?? "")])),
  );

  return (
    <div className="flex flex-col gap-8">
      <Alert tone="info">{t.admin.settingsNote}</Alert>
      {values["trial.enabled"] === "0" && values["package.enabled"] === "0" && (
        <Alert tone="warning" title={t.adminPackage.bothOffTitle}>
          {t.adminPackage.bothOffBody}
        </Alert>
      )}
      {GROUPS.map((g) => (
        <SettingsGroup
          key={g.title}
          group={g}
          values={values}
          onChange={(key, value) => setValues((cur) => ({ ...cur, [key]: value }))}
        />
      ))}
    </div>
  );
}

/** Satu kotak pengaturan dengan formulir dan tombol Simpan sendiri; hanya kunci kotak ini yang dikirim. */
function SettingsGroup({
  group,
  values,
  onChange,
}: {
  group: Group;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const fields = FIELDS.filter((f) => group.keys.includes(f.key));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, string | number> = {};
    for (const f of fields) {
      const raw = (values[f.key] ?? "").trim();
      if (f.kind === "text") {
        payload[f.key] = raw;
        continue;
      }
      const n = Number(raw);
      if (raw === "" || !Number.isFinite(n) || n < 0)
        return setError(`${f.label}: isi angka 0 atau lebih.`);
      payload[f.key] = n;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await api.PUT("/admin/settings", { body: { values: payload } });
    setSaving(false);
    if (err) return setError(msg(err));
    toast.success(`${group.title}: ${t.toast.settingsSaved}`);
  }

  return (
    <form onSubmit={save} noValidate>
      <FormSection title={group.title} description={group.description} icon={group.icon}>
        {fields.map((f) =>
          f.kind === "switch" ? (
            <SwitchRow
              key={f.key}
              className="sm:col-span-2"
              label={f.label}
              description={f.hint}
              checked={values[f.key] === "1"}
              onChange={(on) => onChange(f.key, on ? "1" : "0")}
            />
          ) : (
            <Field key={f.key} label={f.label} htmlFor={f.key} hint={f.hint}>
              <Input
                id={f.key}
                type={f.kind === "number" ? "number" : "text"}
                inputMode={f.kind === "number" ? "numeric" : undefined}
                min={f.kind === "number" ? 0 : undefined}
                value={values[f.key] ?? ""}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            </Field>
          ),
        )}
        {error && (
          <div className="sm:col-span-2">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        <div className="flex justify-end border-t border-ink-200 pt-4 sm:col-span-2">
          <Button type="submit" loading={saving}>
            <Icon name="done" /> {t.common.save}
          </Button>
        </div>
      </FormSection>
    </form>
  );
}
