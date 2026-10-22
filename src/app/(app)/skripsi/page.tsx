"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/features/AppShell";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { formatDateWib } from "@/lib/format";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";

const msg = (e: unknown) => toApiError(e).message;

export default function ThesesPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useAsync(async () => {
    const [thesesRes, guidelinesRes] = await Promise.all([
      api.GET("/theses"),
      api.GET("/guidelines"),
    ]);
    return { theses: unwrap(thesesRes, msg), guidelines: unwrap(guidelinesRes, msg) };
  }, []);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [guidelineId, setGuidelineId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = guidelineId || data?.guidelines[0]?.id || "";

  function openDialog() {
    setTitle("");
    setFormError(null);
    setOpen(true);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setFormError(`${t.thesis.title} ${t.common.required}.`);
    if (!selected) return;
    setSaving(true);
    setFormError(null);
    const { data: created, error: err } = await api.POST("/theses", {
      body: { title: title.trim(), guideline_id: selected },
    });
    setSaving(false);
    if (!created) return setFormError(msg(err));
    toast.success(t.toast.thesisCreated);
    setOpen(false);
    router.push(`/skripsi/${created.id}`);
  }

  return (
    <AppShell
      title={t.nav.theses}
      description={t.pageDesc.theses}
      actions={
        <Button onClick={openDialog} disabled={!data}>
          <Icon name="plus" /> {t.thesis.create}
        </Button>
      }
    >
      {error && <ErrorState message={error} onRetry={() => void reload()} />}
      {loading && !data && <ListSkeleton rows={3} />}

      {data && data.theses.length === 0 && (
        <EmptyState
          icon="thesis"
          title={t.thesis.none}
          body={t.thesis.noneBody}
          action={
            <Button onClick={openDialog}>
              <Icon name="plus" /> {t.thesis.create}
            </Button>
          }
        />
      )}

      {data && data.theses.length > 0 && (
        <ul className="flex flex-col gap-3">
          {data.theses.map((th) => (
            <li key={th.id}>
              <Link
                href={`/skripsi/${th.id}`}
                className="group flex min-h-[72px] items-center gap-4 rounded-xl bg-surface p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-50 text-[20px] text-primary-600">
                  <Icon name="thesis" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold text-ink-900 group-hover:text-primary-600">
                    {th.title}
                  </span>
                  <span className="block text-[13px] leading-5 text-ink-500">
                    {formatDateWib(th.last_activity_at)}
                  </span>
                </span>
                <Icon name="chevronRight" className="text-ink-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => !saving && setOpen(false)}
        dismissible={!saving}
        icon="thesis"
        title={t.thesis.create}
        description={t.thesis.createBody}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              {t.common.cancel}
            </Button>
            <Button type="submit" form="create-thesis" loading={saving}>
              {t.thesis.create}
            </Button>
          </>
        }
      >
        <form id="create-thesis" className="flex flex-col gap-4 pb-2" onSubmit={create} noValidate>
          <Field
            label={t.thesis.title}
            htmlFor="thesis-title"
            hint={t.thesis.titleHint}
            error={formError}
          >
            <Input
              id="thesis-title"
              value={title}
              maxLength={300}
              autoFocus
              invalid={Boolean(formError)}
              onChange={(e) => {
                setTitle(e.target.value);
                if (formError) setFormError(null);
              }}
            />
          </Field>
          <Field label={t.thesis.guideline} htmlFor="thesis-guideline">
            <Select
              id="thesis-guideline"
              value={selected}
              onChange={(e) => setGuidelineId(e.target.value)}
            >
              {data?.guidelines.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>
    </AppShell>
  );
}
