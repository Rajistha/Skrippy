"use client";

import { Icon } from "@/components/ui/Icon";
import { t } from "@/lib/i18n/id";
import { RULE_TITLES, WHOLE_DOCUMENT_RULES, rulesOf, type RuleCategory } from "@/lib/rule-titles";
import type { CheckType } from "@/lib/types";

type Props = {
  /** Kategori yang dipilih untuk cek ini. */
  categories: CheckType[];
  /** Kode aturan yang dimatikan. */
  skipped: string[];
  onChange: (skipped: string[]) => void;
};

const RULE_CATEGORIES: RuleCategory[] = ["format", "structure", "spelling", "citation"];

/** Pilih aturan satu per satu. Tertutup secara bawaan: semua aturan aktif. */
export function RulePicker({ categories, skipped, onChange }: Props) {
  const shown = RULE_CATEGORIES.filter((c) => categories.includes(c));
  if (shown.length === 0) return null;
  const skippedSet = new Set(skipped);

  function toggle(code: string) {
    onChange(skippedSet.has(code) ? skipped.filter((c) => c !== code) : [...skipped, code]);
  }
  function setCategory(category: RuleCategory, enabled: boolean) {
    const codes = rulesOf(category);
    const rest = skipped.filter((c) => !codes.includes(c));
    onChange(enabled ? rest : [...rest, ...codes]);
  }

  return (
    <details className="rounded-lg border border-ink-200 bg-surface">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-[14px] font-semibold text-ink-700">
        <Icon name="settings" /> {t.upload.rulePicker.title}
        {skipped.length > 0 && (
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[12px] text-primary-700">
            {t.upload.rulePicker.off(skipped.length)}
          </span>
        )}
      </summary>
      <div className="flex flex-col gap-4 border-t border-ink-100 px-4 py-4">
        <p className="text-[13px] leading-5 text-ink-500">{t.upload.rulePicker.note}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="min-h-9 rounded-full border border-ink-200 px-4 text-[13px] font-semibold text-ink-700 hover:bg-primary-50"
            onClick={() => onChange([...WHOLE_DOCUMENT_RULES])}
          >
            {t.upload.rulePicker.partial}
          </button>
          <span className="text-[13px] text-ink-500">{t.upload.rulePicker.partialNote}</span>
          {skipped.length > 0 && (
            <button
              type="button"
              className="min-h-9 rounded-full px-3 text-[13px] font-semibold text-primary-600 hover:bg-primary-50"
              onClick={() => onChange([])}
            >
              {t.upload.rulePicker.reset}
            </button>
          )}
        </div>
        {shown.map((category) => {
          const codes = rulesOf(category);
          const allOn = codes.every((c) => !skippedSet.has(c));
          return (
            <fieldset key={category} className="flex flex-col gap-1">
              <legend className="mb-1 flex w-full items-center justify-between gap-3 text-[14px] font-semibold text-ink-900">
                <span>
                  <Icon name={category} /> {t.checks[category]}
                </span>
                <button
                  type="button"
                  className="min-h-9 rounded-full px-3 text-[13px] font-semibold text-primary-600 hover:bg-primary-50"
                  onClick={() => setCategory(category, !allOn)}
                >
                  {allOn ? t.upload.rulePicker.offAll : t.upload.rulePicker.onAll}
                </button>
              </legend>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {codes.map((code) => (
                  <label
                    key={code}
                    className="flex min-h-9 cursor-pointer items-center gap-2 text-[13px] leading-5"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary-500"
                      checked={!skippedSet.has(code)}
                      onChange={() => toggle(code)}
                    />
                    <span className="font-mono text-[12px] text-ink-500">{code}</span>
                    <span className="min-w-0 text-ink-900">{RULE_TITLES[code]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
    </details>
  );
}
