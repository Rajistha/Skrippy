"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { ModelPicker } from "./ModelPicker";
import { Pill } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { FormSection } from "@/components/ui/FormSection";
import { SwitchRow } from "@/components/ui/Switch";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { AI_PROVIDER_IDS, AI_PROVIDER_META, type AiProviderId } from "@/lib/ai-providers";
import { api, toApiError } from "@/lib/api/client";
import { t } from "@/lib/i18n/id";
import type { AiStatusAdmin } from "@/lib/schemas";

const msg = (e: unknown) => toApiError(e).message;

/** Panduan menghubungkan penyedia yang sedang dipilih: langkah, catatan model, dan contoh alamat dasar. */
function Guide({
  provider,
  open,
  onUseExample,
}: {
  provider: AiProviderId;
  open: boolean;
  onUseExample: (url: string, model: string) => void;
}) {
  const g = t.adminAi.guide;
  const info = g.providers[provider];
  const steps = [...info.steps, ...g.finish];
  return (
    <details open={open} className="group rounded-lg border border-ink-200 bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-[15px] font-semibold text-ink-900">
        <span className="flex items-center gap-2">
          <Icon name="book" className="text-primary-600" />{" "}
          {g.title(AI_PROVIDER_META[provider].label)}
        </span>
        <Icon
          name="chevronDown"
          className="text-ink-400 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-4 border-t border-ink-100 px-4 py-4">
        <ol className="flex flex-col gap-3">
          {steps.map((step, i) => (
            <li key={step} className="flex items-start gap-3 text-[14px] leading-6 text-ink-700">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary-100 text-[12px] font-bold text-primary-700">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        {info.url && (
          <a
            href={info.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full border border-primary-300 px-4 text-[13px] font-semibold text-primary-700 hover:bg-primary-50"
          >
            <Icon name="external" /> {info.host}
          </a>
        )}
        <p className="text-[13px] leading-5 text-ink-500">{info.modelNote}</p>
        {provider === "openai_compatible" && (
          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink-700">{g.examplesTitle}</p>
            <ul className="flex flex-col gap-2">
              {g.examples.map((ex) => (
                <li
                  key={ex.name}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-primary-50/60 px-3 py-2"
                >
                  <span className="min-w-0 text-[13px] leading-5">
                    <span className="font-semibold text-ink-900">{ex.name}</span>
                    <span className="block break-all font-mono text-[12px] text-ink-500">
                      {ex.url} · {ex.model}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-9 px-4"
                    onClick={() => onUseExample(ex.url, ex.model)}
                  >
                    {g.use}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="rounded-md bg-ink-100/60 px-3 py-3">
          <p className="mb-1 text-[13px] font-semibold text-ink-700">{g.generalTitle}</p>
          <ul className="flex flex-col gap-1">
            {g.general.map((line) => (
              <li key={line} className="flex items-start gap-2 text-[13px] leading-5 text-ink-500">
                <Icon name="info" className="mt-0.5 shrink-0" /> {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

/** Menghubungkan analisis AI (Fase 3). Tanpa kunci, aplikasi tetap berjalan dan pengguna melihat "AI belum bisa digunakan". */
export function AiSettings({ initial }: { initial: AiStatusAdmin }) {
  const s = t.adminAi;
  const [status, setStatus] = useState(initial);
  const [provider, setProvider] = useState<AiProviderId>(initial.provider);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initial.model);
  const [baseUrl, setBaseUrl] = useState(initial.base_url);
  const [limit, setLimit] = useState(String(initial.daily_limit));
  const [enabled, setEnabled] = useState(initial.enabled);
  const [allowTrial, setAllowTrial] = useState(initial.allow_trial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const meta = AI_PROVIDER_META[provider];
  const compatible = provider === "openai_compatible";
  const switched = provider !== status.provider;
  const hasKeyForSelected = status.connected_providers.includes(provider);

  function chooseProvider(next: AiProviderId) {
    setProvider(next);
    setModel(next === status.provider ? status.model : AI_PROVIDER_META[next].defaultModel);
    setBaseUrl(next === "openai_compatible" ? status.base_url : "");
    setApiKey("");
    setError(null);
    setTestResult(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(limit);
    if (!Number.isInteger(n) || n < 1 || n > 100) return setError(s.limitInvalid);
    if (apiKey && apiKey.trim().length < 8) return setError(s.keyInvalid);
    if (!hasKeyForSelected && !apiKey) return setError(s.keyRequired);
    if (!model.trim()) return setError(s.modelRequired);
    if (compatible && !baseUrl.trim()) return setError(s.baseUrlRequired);
    setSaving(true);
    setError(null);
    const { data, error: err } = await api.PUT("/admin/ai", {
      body: {
        provider,
        ...(apiKey ? { api_key: apiKey.trim() } : {}),
        model: model.trim(),
        ...(compatible ? { base_url: baseUrl.trim() } : {}),
        enabled,
        daily_limit: n,
        allow_trial: allowTrial,
      },
    });
    setSaving(false);
    if (!data) return setError(msg(err));
    setStatus(data);
    setProvider(data.provider);
    setModel(data.model);
    setBaseUrl(data.base_url);
    setApiKey("");
    setTestResult(null);
    toast.success(s.saved);
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    const { data, error: err } = await api.POST("/admin/ai/test");
    setTesting(false);
    setTestResult(data ?? { ok: false, message: msg(err) });
  }

  async function disconnect() {
    const { data, error: err } = await api.DELETE("/admin/ai");
    if (!data) throw new Error(msg(err));
    setStatus(data);
    setEnabled(false);
    setTestResult(null);
    toast.success(s.disconnected);
  }

  const pill = !status.connected
    ? ({ tone: "neutral", icon: "ban", text: s.stateNone } as const)
    : status.available
      ? ({ tone: "success", icon: "done", text: s.stateOn } as const)
      : ({ tone: "primary", icon: "info", text: s.stateOff } as const);

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-8">
      <FormSection title={s.title} description={s.description} icon="ai">
        <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone={pill.tone} icon={pill.icon}>
              {pill.text}
            </Pill>
            {status.connected && (
              <span className="text-[13px] text-ink-500">
                {AI_PROVIDER_META[status.provider].label}
              </span>
            )}
          </span>
          {status.key_hint && (
            <span className="text-[13px] text-ink-500">
              {s.keySaved} <span className="font-mono">{status.key_hint}</span>
            </span>
          )}
        </div>
        {!status.connected && (
          <div className="sm:col-span-2">
            <Alert tone="info">{s.notConnectedNote}</Alert>
          </div>
        )}

        <div className="sm:col-span-2">
          <Field label={s.providerLabel} htmlFor="ai-provider">
            <Select
              id="ai-provider"
              value={provider}
              onChange={(e) => chooseProvider(e.target.value as AiProviderId)}
            >
              {AI_PROVIDER_IDS.map((id) => (
                <option key={id} value={id}>
                  {AI_PROVIDER_META[id].label}
                  {status.connected_providers.includes(id) ? " (kunci tersimpan)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Guide
            key={provider}
            provider={provider}
            open={!hasKeyForSelected}
            onUseExample={(url, m) => {
              setBaseUrl(url);
              setModel(m);
            }}
          />
        </div>

        {compatible && (
          <div className="sm:col-span-2">
            <Field label={s.baseUrlLabel} htmlFor="ai-base-url" hint={s.baseUrlHint}>
              <Input
                id="ai-base-url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://openrouter.ai/api/v1"
              />
            </Field>
          </div>
        )}

        <div className="sm:col-span-2">
          <Field
            label={s.keyLabel}
            htmlFor="ai-key"
            hint={
              hasKeyForSelected ? s.keyReplaceHint : s.keyHintFor(s.guide.providers[provider].host)
            }
          >
            <Input
              id="ai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKeyForSelected ? "••••••••••••" : "Tempel kunci API di sini"}
            />
          </Field>
        </div>
        <ModelPicker
          provider={provider}
          apiKey={apiKey}
          baseUrl={baseUrl}
          value={model}
          onChange={setModel}
        />
        <Field label={s.limitLabel} htmlFor="ai-limit" hint={s.limitHint}>
          <Input
            id="ai-limit"
            inputMode="numeric"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </Field>
        <SwitchRow checked={enabled} onChange={setEnabled} label={s.enableLabel} />
        <SwitchRow checked={allowTrial} onChange={setAllowTrial} label={s.allowTrialLabel} />
        {switched && status.connected && (
          <div className="sm:col-span-2">
            <Alert tone="info">
              {s.switchNote(AI_PROVIDER_META[status.provider].label, meta.label)}
            </Alert>
          </div>
        )}
        <div className="sm:col-span-2">
          <Alert tone="warning" title={s.privacyTitle}>
            {s.privacyBody}
          </Alert>
        </div>
        {error && (
          <div className="sm:col-span-2">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        {testResult && (
          <div className="sm:col-span-2">
            <Alert tone={testResult.ok ? "success" : "error"}>{testResult.message}</Alert>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-ink-200 pt-4 sm:col-span-2">
          {status.connected && (
            <>
              <Button type="button" variant="ghost" onClick={() => setDisconnecting(true)}>
                <Icon name="ban" /> {s.disconnect}
              </Button>
              <Button type="button" variant="outline" loading={testing} onClick={() => void test()}>
                <Icon name="zap" /> {s.test}
              </Button>
            </>
          )}
          <Button type="submit" loading={saving}>
            <Icon name="done" /> {t.common.save}
          </Button>
        </div>
      </FormSection>

      <ConfirmDialog
        open={disconnecting}
        onClose={() => setDisconnecting(false)}
        tone="danger"
        icon="ban"
        title={s.disconnectTitle}
        description={s.disconnectBody}
        confirmLabel={s.disconnect}
        onConfirm={disconnect}
      />
    </form>
  );
}
