"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/Card";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";
import type { DictionaryEntryOut } from "@/lib/schemas";

const msg = (e: unknown) => toApiError(e).message;

export function DictionaryAdmin() {
  const d = t.dictionary;
  const { data, error, loading, reload } = useAsync(
    async () => unwrap(await api.GET("/admin/dictionary"), msg),
    [],
  );
  const [kind, setKind] = useState<"nonstandard" | "foreign">("nonstandard");
  const [term, setTerm] = useState("");
  const [replacement, setReplacement] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<DictionaryEntryOut | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const { error: err } = await api.POST("/admin/dictionary", {
      body: { kind, term, replacement: kind === "nonstandard" ? replacement : null },
    });
    setSaving(false);
    if (err) return setFormError(msg(err));
    toast.success(d.added);
    setTerm("");
    setReplacement("");
    await reload();
  }

  async function remove(entry: DictionaryEntryOut) {
    const { error: err } = await api.DELETE("/admin/dictionary/{entry_id}", {
      params: { path: { entry_id: entry.id } },
    });
    if (err) throw new Error(msg(err));
    toast.success(d.removed);
    await reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <form
          onSubmit={add}
          className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr_1fr_auto] sm:items-end"
        >
          <Field label={d.kind} htmlFor="dict-kind">
            <Select
              id="dict-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="nonstandard">{d.nonstandard}</option>
              <option value="foreign">{d.foreign}</option>
            </Select>
          </Field>
          <Field label={kind === "nonstandard" ? d.wrongWord : d.foreignTerm} htmlFor="dict-term">
            <Input id="dict-term" value={term} onChange={(e) => setTerm(e.target.value)} required />
          </Field>
          {kind === "nonstandard" ? (
            <Field label={d.rightWord} htmlFor="dict-right" error={formError}>
              <Input
                id="dict-right"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                required
              />
            </Field>
          ) : (
            <Field label=" " htmlFor="dict-none" error={formError}>
              <p id="dict-none" className="min-h-11 py-2.5 text-[13px] text-ink-500">
                {d.foreignNote}
              </p>
            </Field>
          )}
          <Button type="submit" loading={saving}>
            <Icon name="plus" /> {d.add}
          </Button>
        </form>
      </Card>

      {error && <ErrorState message={error} onRetry={() => void reload()} />}
      {loading && !data && <ListSkeleton rows={3} className="h-12" />}
      {data && data.length === 0 && (
        <EmptyState icon="book" title={d.emptyTitle} body={d.emptyBody} />
      )}
      {data && data.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[420px] text-left text-[14px]">
            <thead>
              <tr className="text-[13px] text-ink-500">
                <th className="px-4 py-3 font-semibold">{d.kind}</th>
                <th className="px-4 py-3 font-semibold">{d.term}</th>
                <th className="px-4 py-3 font-semibold">{d.rightWord}</th>
                <th className="px-4 py-3">
                  <span className="sr-only">{t.common.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-t border-ink-100">
                  <td className="px-4 py-2">
                    {r.kind === "nonstandard" ? d.nonstandard : d.foreign}
                  </td>
                  <td className="px-4 py-2 font-semibold text-ink-900">{r.term}</td>
                  <td className="px-4 py-2">{r.replacement ?? "-"}</td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="danger"
                      className="min-h-9 px-3"
                      onClick={() => setRemoving(r)}
                    >
                      <Icon name="trash" /> {t.common.delete}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={d.removeTitle}
        description={removing ? d.removeBody(removing.term) : ""}
        confirmLabel={t.common.delete}
        tone="danger"
        onConfirm={() => remove(removing!)}
      />
    </div>
  );
}
