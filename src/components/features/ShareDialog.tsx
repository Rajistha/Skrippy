"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { formatDateWib } from "@/lib/format";
import { t } from "@/lib/i18n/id";
import type { ShareLink } from "@/lib/schemas";

/** Berbagi laporan ke dosen lewat tautan baca-saja. Token asli hanya tampil sekali, tepat setelah dibuat. */
export function ShareDialog({
  runId,
  open,
  onClose,
}: {
  runId: string;
  open: boolean;
  onClose: () => void;
}) {
  const s = t.share;
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [fresh, setFresh] = useState<{ id: string; url: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await api.GET("/checks/{run_id}/share", {
      params: { path: { run_id: runId } },
    });
    if (data) setLinks(data);
    else setError(toApiError(err).message);
  }, [runId]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [open, load]);

  async function create() {
    setCreating(true);
    setError(null);
    const { data, error: err } = await api.POST("/checks/{run_id}/share", {
      params: { path: { run_id: runId } },
    });
    setCreating(false);
    if (!data) return setError(toApiError(err).message);
    setFresh({ id: data.link.id, url: data.url });
    toast.success(s.created);
    await load();
  }

  async function revoke(id: string) {
    setRevoking(id);
    const { error: err } = await api.DELETE("/checks/{run_id}/share/{link_id}", {
      params: { path: { run_id: runId, link_id: id } },
    });
    setRevoking(null);
    if (err) return toast.error(toApiError(err).message);
    if (fresh?.id === id) setFresh(null);
    toast.success(s.revoked);
    await load();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={s.title}
      description={s.description}
      icon="share"
      size="md"
    >
      <div className="flex flex-col gap-4">
        <Alert tone="warning">{s.warning}</Alert>
        {error && <Alert tone="error">{error}</Alert>}

        {fresh && (
          <div className="flex flex-col gap-2 rounded-lg bg-primary-50 p-4">
            <p className="text-[13px] font-semibold text-primary-700">{s.newLink}</p>
            <p className="break-all rounded-md bg-surface px-3 py-2 font-mono text-[13px] text-ink-900">
              {fresh.url}
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-ink-500">{s.shownOnce}</span>
              <CopyButton text={fresh.url} label={t.common.copy} />
            </div>
          </div>
        )}

        <Button onClick={() => void create()} loading={creating} className="self-start">
          <Icon name="plus" /> {s.create}
        </Button>

        <div>
          <h3 className="mb-2 text-[14px] font-semibold text-ink-900">{s.activeTitle}</h3>
          {links === null ? (
            <p className="text-[13px] text-ink-500">{t.common.loading}</p>
          ) : links.length === 0 ? (
            <p className="text-[13px] text-ink-500">{s.none}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-ink-100">
              {links.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[13px] leading-5 text-ink-700">
                    {s.expires(formatDateWib(l.expires_at))}
                  </span>
                  <Button
                    variant="ghost"
                    className="min-h-9 px-3"
                    loading={revoking === l.id}
                    onClick={() => void revoke(l.id)}
                  >
                    {s.revoke}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
