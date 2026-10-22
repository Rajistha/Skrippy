"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";
import { RULE_TITLES } from "@/lib/rule-titles";

const msg = (e: unknown) => toApiError(e).message;

/** Daftar temuan yang selalu diabaikan pengguna, dengan tombol hapus agar bisa diaktifkan lagi. */
export function IgnoredList() {
  const g = t.ignored;
  const { data, error, loading, reload } = useAsync(
    async () => unwrap(await api.GET("/ignored"), msg),
    [],
  );
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(id: string) {
    setBusy(id);
    const { error: err } = await api.DELETE("/ignored/{ignored_id}", {
      params: { path: { ignored_id: id } },
    });
    setBusy(null);
    if (err) return toast.error(msg(err));
    toast.success(g.removed);
    await reload();
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-[18px] font-semibold leading-7 text-ink-900">
          <Icon name="ban" /> {g.title}
        </h2>
        <p className="text-[14px] leading-5 text-ink-500">{g.body}</p>
      </div>
      {error && <ErrorState message={error} onRetry={() => void reload()} />}
      {loading && !data && <ListSkeleton rows={2} className="h-10" />}
      {data && data.length === 0 && <p className="text-[14px] text-ink-500">{g.empty}</p>}
      {data && data.length > 0 && (
        <ul className="flex flex-col divide-y divide-ink-100">
          {data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 text-[14px]">
                <span className="font-mono text-[12px] text-ink-500">{r.rule_code}</span>{" "}
                {RULE_TITLES[r.rule_code] ? `${RULE_TITLES[r.rule_code]}: ` : ""}
                <span className="font-semibold text-ink-900">{r.text}</span>
              </span>
              <Button
                variant="ghost"
                className="min-h-9 px-3"
                loading={busy === r.id}
                onClick={() => void remove(r.id)}
              >
                {g.remove}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
