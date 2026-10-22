"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { api, toApiError } from "@/lib/api/client";
import { t } from "@/lib/i18n/id";

const MAX_COUNT = 500;
const MAX_QUOTA = 1000;

/** Form "Batch baru": jumlah kode, kuota pakai per kode, berlaku sampai (boleh kosong), dan catatan. */
export function CreateBatchModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Dipanggil dengan id batch yang baru dibuat. */
  onCreated: (batchId: string) => void;
}) {
  const k = t.adminCodes;
  const [count, setCount] = useState("10");
  const [quota, setQuota] = useState("1");
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(count);
    const q = Number(quota);
    if (!Number.isInteger(n) || n < 1 || n > MAX_COUNT) return setError(k.countInvalid(MAX_COUNT));
    if (!Number.isInteger(q) || q < 1 || q > MAX_QUOTA) return setError(k.quotaInvalid(MAX_QUOTA));
    if (until && until < new Date().toISOString().slice(0, 10)) return setError(k.untilInvalid);
    setCreating(true);
    setError(null);
    const { data, error: err } = await api.POST("/admin/codes", {
      body: {
        kind: "package",
        count: n,
        max_redemptions: q,
        valid_until: until || null,
        recipient_note: note.trim() || null,
      },
    });
    setCreating(false);
    const batchId = data?.[0]?.batch_id;
    if (!data || !batchId) return setError(err ? toApiError(err).message : t.common.genericError);
    setNote("");
    onCreated(batchId);
  }

  return (
    <Modal
      open={open}
      onClose={() => !creating && onClose()}
      dismissible={!creating}
      icon="code"
      title={k.newBatch}
      description={k.formBody}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form="create-batch" loading={creating}>
            <Icon name="plus" /> {k.createSubmit}
          </Button>
        </>
      }
    >
      <form id="create-batch" className="flex flex-col gap-4 pb-2" onSubmit={create} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={k.countLabel} htmlFor="count" hint={k.countHint(MAX_COUNT)}>
            <Input
              id="count"
              inputMode="numeric"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label={k.quotaLabel} htmlFor="quota" hint={k.quotaHint}>
            <Input
              id="quota"
              inputMode="numeric"
              value={quota}
              onChange={(e) => setQuota(e.target.value)}
            />
          </Field>
        </div>
        <Field label={k.untilLabel} htmlFor="until" hint={k.untilHint}>
          <Input id="until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
        <Field label={k.noteLabel} htmlFor="note" hint={t.common.optional}>
          <Textarea
            id="note"
            rows={3}
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder={k.notePlaceholder}
          />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  );
}
