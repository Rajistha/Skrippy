"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { AI_FALLBACK_MODELS, type AiModelOption, type AiProviderId } from "@/lib/ai-providers";
import { api } from "@/lib/api/client";
import { t } from "@/lib/i18n/id";
import type { AiModelList } from "@/lib/schemas";

const CUSTOM = "__custom__";

type Props = {
  provider: AiProviderId;
  /** Kunci yang baru diketik (belum disimpan). Kosong: pakai kunci tersimpan bila ada. */
  apiKey: string;
  baseUrl: string;
  value: string;
  onChange: (model: string) => void;
};

/**
 * Pilihan model: daftar diambil otomatis dari penyedia (memakai kunci yang tersimpan atau yang baru diketik),
 * dengan daftar bawaan sebagai cadangan. "Ketik sendiri" untuk model yang tidak ada di daftar.
 */
export function ModelPicker({ provider, apiKey, baseUrl, value, onChange }: Props) {
  const s = t.adminAi;
  const [list, setList] = useState<AiModelList | null>(null);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [custom, setCustom] = useState(false);

  const usableKey = apiKey.trim().length >= 8 ? apiKey.trim() : undefined;
  const usableBase = provider === "openai_compatible" ? baseUrl.trim() : "";

  // Muat daftar saat penyedia, kunci, atau alamat dasar berubah (ditunda sebentar agar tidak menembak tiap ketukan).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void api
        .POST("/admin/ai/models", {
          body: {
            provider,
            ...(usableKey ? { api_key: usableKey } : {}),
            ...(usableBase ? { base_url: usableBase } : {}),
          },
        })
        .then(({ data }) => {
          if (cancelled) return;
          setList(
            data ?? {
              models: AI_FALLBACK_MODELS[provider],
              source: "fallback",
              note: s.modelsFailed,
            },
          );
          setLoading(false);
        });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [provider, usableKey, usableBase, reload, s.modelsFailed]);

  const models: AiModelOption[] = list?.models ?? AI_FALLBACK_MODELS[provider];
  const known = models.some((m) => m.id === value);
  const showCustom = custom || (value !== "" && !known && list !== null && models.length === 0);
  const selectValue = showCustom ? CUSTOM : known ? value : value ? `__current__:${value}` : "";

  return (
    <div className="flex flex-col gap-2">
      <Field
        label={s.modelLabel}
        htmlFor="ai-model"
        hint={provider === "openai_compatible" ? s.modelHintCompatible : s.modelHint}
      >
        <div className="flex gap-2">
          <Select
            id="ai-model"
            className="min-w-0 flex-1"
            value={selectValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === CUSTOM) {
                setCustom(true);
                return;
              }
              setCustom(false);
              if (v.startsWith("__current__:")) return;
              onChange(v);
            }}
          >
            {value === "" && <option value="">{s.modelPlaceholder}</option>}
            {!known && value && !showCustom && (
              <option value={`__current__:${value}`}>{`${value} ${s.modelCurrent}`}</option>
            )}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            <option value={CUSTOM}>{s.modelCustom}</option>
          </Select>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 shrink-0 px-3"
            loading={loading}
            aria-label={s.modelsReload}
            onClick={() => setReload((n) => n + 1)}
          >
            <Icon name="refresh" />
          </Button>
        </div>
      </Field>
      {showCustom && (
        <Input
          aria-label={s.modelCustom}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={100}
          placeholder="nama-model"
          autoComplete="off"
          spellCheck={false}
        />
      )}
      <p className="text-[12px] leading-4 text-ink-500" aria-live="polite">
        {loading
          ? s.modelsLoading
          : list?.source === "provider"
            ? s.modelsFromProvider(models.length)
            : (list?.note ?? s.modelsFallback)}
      </p>
    </div>
  );
}
