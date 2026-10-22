"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { unwrap, useAsync } from "@/lib/hooks";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { t } from "@/lib/i18n/id";
import { useSession } from "@/lib/session";
import type { AiUserStatus } from "@/lib/schemas";
import { CHECK_TYPES, type CheckType } from "@/lib/types";
import { putToSignedUrl, validateFile } from "@/lib/upload";
import { RulePicker } from "./RulePicker";
import { Stepper } from "./Stepper";

type Props = { thesisId: string; existingDocumentId?: string };

/** Langkah 1: unggah. Langkah 2: pilih jenis cek. Langkah 3: jalankan, lalu menuju laporan. */
export function UploadFlow({ thesisId, existingDocumentId }: Props) {
  const router = useRouter();
  const { me, refresh } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"idle" | "uploading" | "validating">("idle");
  const [documentId, setDocumentId] = useState<string | null>(existingDocumentId ?? null);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CheckType[]>(CHECK_TYPES);
  const [useAi, setUseAi] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const { data: ai } = useAsync(
    async () => unwrap(await api.GET("/ai/status"), (e) => toApiError(e).message),
    [],
  );

  const access = me.access;
  const canRun = access.state === "trial" || access.state === "package";
  const uploading = phase !== "idle";
  const step = running ? 2 : documentId ? 1 : 0;

  async function handleFile(f: File) {
    setError(null);
    const verdict = validateFile(f);
    if (verdict === "not_docx") return setError(t.upload.onlyDocx);
    if (verdict === "too_big") return setError(t.upload.tooBig);

    setFile(f);
    setPhase("uploading");
    setProgress(0);
    try {
      const { data: start, error: startErr } = await api.POST("/theses/{thesis_id}/uploads", {
        params: { path: { thesis_id: thesisId } },
        body: { filename: f.name },
      });
      if (!start) throw new Error(toApiError(startErr).message);
      await putToSignedUrl(start.upload_url, f, setProgress);
      setPhase("validating");
      const { data: doc, error: confirmErr } = await api.POST("/documents/{document_id}/confirm", {
        params: { path: { document_id: start.document_id } },
      });
      if (!doc) throw new Error(toApiError(confirmErr).message);
      setDocumentId(doc.id);
      toast.success(t.toast.uploaded);
    } catch (e) {
      setFile(null);
      setError(e instanceof Error && e.message !== "network" ? e.message : t.errors.network);
    } finally {
      setPhase("idle");
    }
  }

  async function run() {
    if (!documentId) return;
    setRunning(true);
    setError(null);
    const { data, error: err } = await api.POST("/documents/{document_id}/checks", {
      params: { path: { document_id: documentId } },
      body: {
        check_types: useAi && ai?.can_use ? [...selected, "ai"] : selected,
        skip_rules: skipped.length > 0 ? skipped : null,
      },
    });
    if (!data) {
      setRunning(false);
      setError(toApiError(err).message);
      return;
    }
    toast.info(t.toast.checkStarted);
    await refresh();
    router.push(`/laporan/${data.id}`);
  }

  function reset() {
    setFile(null);
    setDocumentId(null);
    setError(null);
    setProgress(0);
  }

  function toggle(c: CheckType) {
    setSelected((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  }

  const quota =
    access.checks_left !== null ? t.upload.quotaTrial(access.checks_left) : t.upload.quotaPackage;

  return (
    <div className="flex flex-col gap-6">
      <Stepper
        steps={[t.upload.stepUpload, t.upload.stepChoose, t.upload.stepRun]}
        current={step}
      />

      {!documentId && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f && !uploading) void handleFile(f);
          }}
          className={cn(
            "flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border-2 px-4 py-10 text-center transition-colors",
            dragging
              ? "border-solid border-primary-500 bg-primary-100"
              : "border-dashed border-primary-300 bg-primary-50/70",
          )}
        >
          <span className="grid size-16 place-items-center rounded-full bg-surface text-[28px] text-primary-600 shadow-sm">
            <Icon name="cloudUpload" />
          </span>
          <p className="text-[16px] font-semibold text-ink-900">
            {dragging ? t.upload.dragging : t.upload.drop}
          </p>
          <p className="text-[13px] leading-5 text-ink-500">{t.upload.max}</p>
          <input
            ref={input}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            tabIndex={-1}
            aria-label={t.thesis.upload}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <Button variant="primary" onClick={() => input.current?.click()} disabled={uploading}>
            <Icon name="upload" /> {t.thesis.upload}
          </Button>
        </div>
      )}

      {file && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-50 text-[20px] text-primary-600">
              <Icon name={documentId ? "fileCheck" : "thesis"} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink-900">{file.name}</p>
              <p className="text-[13px] leading-5 text-ink-500">
                {formatBytes(file.size)} ·{" "}
                {phase === "uploading"
                  ? `${t.upload.uploading} ${Math.round(progress * 100)}%`
                  : phase === "validating"
                    ? t.upload.validating
                    : t.upload.uploaded}
              </p>
            </div>
            {!uploading && (
              <Button variant="ghost" onClick={reset} aria-label={t.upload.remove}>
                <Icon name="close" />
              </Button>
            )}
          </div>
          {uploading && (
            <div
              role="progressbar"
              aria-valuenow={phase === "validating" ? 100 : Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t.upload.uploading}
              className="h-2 overflow-hidden rounded-full bg-primary-100"
            >
              <div
                className={cn(
                  "h-full rounded-full bg-primary-500 transition-[width]",
                  phase === "validating" && "animate-pulse",
                )}
                style={{ width: `${phase === "validating" ? 100 : progress * 100}%` }}
              />
            </div>
          )}
        </Card>
      )}

      {documentId && (
        <Card className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[20px] font-semibold leading-7 text-ink-900">
              {t.upload.chooseChecks}
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CHECK_TYPES.map((c) => {
                const on = selected.includes(c);
                return (
                  <label
                    key={c}
                    className={cn(
                      "flex min-h-[72px] cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-3 transition-colors",
                      on
                        ? "border-primary-500 bg-primary-50"
                        : "border-ink-200 bg-surface hover:border-primary-200",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-5 accent-primary-500"
                      checked={on}
                      onChange={() => toggle(c)}
                    />
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-primary-600 shadow-sm">
                      <Icon name={c} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink-900">{t.checks[c]}</span>
                      <span className="block text-[12px] leading-4 text-ink-500">
                        {t.checkHelp[c]}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <RulePicker categories={selected} skipped={skipped} onChange={setSkipped} />

          <AiOption status={ai ?? null} checked={useAi} onChange={setUseAi} />

          {canRun ? (
            <p className="flex items-center gap-2 text-[13px] leading-5 text-ink-500">
              <Icon name="info" /> {quota}
            </p>
          ) : (
            <Alert
              tone="warning"
              action={
                <Link
                  href="/profil"
                  className="inline-flex min-h-11 items-center gap-2 font-semibold underline underline-offset-2"
                >
                  <Icon name="code" /> {t.access.redeemTitle}
                </Link>
              }
            >
              {t.access.runDisabled}
            </Alert>
          )}

          <Button
            onClick={() => void run()}
            loading={running}
            disabled={!canRun || (selected.length === 0 && !(useAi && ai?.can_use))}
            className="self-start"
          >
            <Icon name="play" /> {t.thesis.runCheck}
          </Button>
        </Card>
      )}

      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

/** Opsi AI: selalu terlihat, tetapi nonaktif dengan alasan yang jelas bila belum bisa dipakai. */
function AiOption({
  status,
  checked,
  onChange,
}: {
  status: AiUserStatus | null;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const a = t.ai;
  const usable = status?.can_use === true;
  const reason =
    status === null
      ? null
      : status.reason === "not_connected"
        ? a.notConnected
        : status.reason === "package_only"
          ? a.packageOnly
          : status.reason === "daily_limit"
            ? a.dailyLimit(status.daily_limit)
            : null;
  return (
    <label
      className={cn(
        "flex items-start gap-3 rounded-lg border-2 px-4 py-3 transition-colors",
        usable ? "cursor-pointer" : "cursor-not-allowed opacity-80",
        checked && usable ? "border-primary-500 bg-primary-50" : "border-ink-200 bg-surface",
      )}
    >
      <input
        type="checkbox"
        className="mt-1 size-5 accent-primary-500"
        checked={checked && usable}
        disabled={!usable}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-primary-600 shadow-sm">
        <Icon name="ai" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 font-semibold text-ink-900">
          {t.checks.ai}
          <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[12px] font-semibold text-ink-500">
            {usable ? a.optionalBadge : status === null ? t.common.loading : a.unavailableBadge}
          </span>
        </span>
        <span className="block text-[12px] leading-4 text-ink-500">{t.checkHelp.ai}</span>
        {reason && <span className="mt-1 block text-[13px] leading-5 text-ink-700">{reason}</span>}
        {usable && status && (
          <span className="mt-1 block text-[13px] leading-5 text-ink-500">
            {a.remaining(Math.max(0, status.daily_limit - status.used_today), status.daily_limit)}{" "}
            {a.privacy}
          </span>
        )}
      </span>
    </label>
  );
}
