"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n/id";
import { Alert } from "./Alert";
import { Button } from "./Button";
import type { IconName } from "./Icon";
import { Modal } from "./Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  icon?: IconName;
  /** Boleh async. Bila melempar Error, pesannya tampil di dialog dan dialog tetap terbuka. */
  onConfirm: () => Promise<void> | void;
};

/** Konfirmasi tindakan. Tombol memproses (loading) dan dialog tidak bisa ditutup selama itu berjalan. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = t.common.cancel,
  tone = "primary",
  icon,
  onConfirm,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.common.genericError);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    setError(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={description}
      size="sm"
      dismissible={!busy}
      tone={tone === "danger" ? "danger" : "default"}
      icon={icon ?? (tone === "danger" ? "warning" : "help")}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "dangerSolid" : "primary"}
            onClick={() => void confirm()}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}
    </Modal>
  );
}
