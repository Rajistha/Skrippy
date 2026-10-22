"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { api, toApiError } from "@/lib/api/client";
import { t } from "@/lib/i18n/id";
import type { GuidelineTest } from "@/lib/schemas";
import { RULE_TITLES } from "@/lib/rule-titles";
import { putToSignedUrl } from "@/lib/upload";

const msg = (e: unknown) => toApiError(e).message;
const MAX_FILE = 25 * 1024 * 1024;

/** Jalankan aturan yang sedang disusun pada naskah contoh .docx; tidak ada yang disimpan. */
export function GuidelineTester({ getRules }: { getRules: () => Record<string, unknown> }) {
  const g = t.guidelines.tester;
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "working">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GuidelineTest | null>(null);

  async function test(file: File) {
    setError(null);
    setResult(null);
    if (!file.name.toLowerCase().endsWith(".docx")) return setError(g.onlyDocx);
    if (file.size > MAX_FILE) return setError(t.upload.tooBig);
    setState("working");
    try {
      const start = await api.POST("/admin/guidelines/upload-url", {
        body: { filename: file.name },
      });
      if (!start.data) throw new Error(msg(start.error));
      await putToSignedUrl(start.data.upload_url, file, () => undefined);
      const res = await api.POST("/admin/guidelines/test", {
        body: { path: start.data.path, rules: getRules() as never },
      });
      if (!res.data) throw new Error(msg(res.error));
      setResult(res.data);
    } catch (e) {
      setError(e instanceof Error && e.message !== "network" ? e.message : t.errors.network);
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <p className="text-[14px] leading-5 text-ink-500">{g.body}</p>
      <div>
        <input
          ref={input}
          type="file"
          accept=".docx"
          className="sr-only"
          aria-label={g.pick}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void test(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          loading={state === "working"}
          onClick={() => input.current?.click()}
        >
          <Icon name="cloudUpload" /> {g.pick}
        </Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {result && (
        <div className="flex flex-col gap-3" aria-live="polite">
          <p className="text-[14px] text-ink-900">
            {g.summary(result.words, result.issue_count, Math.round(result.score_total))}
          </p>
          {result.by_rule.length === 0 ? (
            <Alert tone="success">{g.clean}</Alert>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-ink-200">
              <table className="w-full min-w-[360px] text-left text-[13px]">
                <thead>
                  <tr className="text-ink-500">
                    <th className="px-3 py-2 font-semibold">{g.rule}</th>
                    <th className="px-3 py-2 font-semibold">{g.count}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.by_rule.map((r) => (
                    <tr key={r.rule_code} className="border-t border-ink-100">
                      <td className="px-3 py-2">
                        <span className="font-mono text-[12px] text-ink-500">{r.rule_code}</span>{" "}
                        {RULE_TITLES[r.rule_code] ?? ""}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
