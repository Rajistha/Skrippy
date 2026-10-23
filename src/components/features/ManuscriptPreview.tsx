"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RuleCode, SeverityBadge, type Severity } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, ListSkeleton } from "@/components/ui/States";
import { api, toApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { unwrap, useAsync } from "@/lib/hooks";
import { t } from "@/lib/i18n/id";
import type { Issue, ManuscriptPreview as Preview } from "@/lib/types";

type Para = Preview["paragraphs"][number];

const RANK: Record<Severity, number> = { critical: 3, major: 2, minor: 1 };

/** Garis kiri paragraf dan sorotan teks. Bentuk ikon pada chip tetap jadi penanda utama, bukan warna. */
const EDGE: Record<Severity, string> = {
  critical: "border-sev-critical",
  major: "border-sev-major",
  minor: "border-sev-minor",
};
const MARK: Record<Severity, string> = {
  critical: "bg-sev-critical-bg decoration-sev-critical",
  major: "bg-sev-major-bg decoration-sev-major",
  minor: "bg-sev-minor-bg decoration-sev-minor",
};
const ALIGN = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
} as const;

/** Naskah yang sudah dimuat disimpan selama sesi tab supaya membuka ulang tidak mengunduh lagi. */
const cache = new Map<string, Preview>();

type Segment = { text: string; severity: Severity | null };

/** Potong teks paragraf menjadi bagian biasa dan bagian yang disorot (kutipan temuan), tanpa tumpang tindih. */
function segments(text: string, issues: Issue[]): Segment[] {
  const ranges: { start: number; end: number; severity: Severity }[] = [];
  for (const issue of issues) {
    const quote = (issue.excerpt ?? "").replace(/…$/, "").trim();
    if (quote.length < 3) continue;
    const start = text.indexOf(quote);
    if (start < 0) continue;
    ranges.push({ start, end: start + quote.length, severity: issue.severity as Severity });
  }
  ranges.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.start < at) continue;
    if (r.start > at) out.push({ text: text.slice(at, r.start), severity: null });
    out.push({ text: text.slice(r.start, r.end), severity: r.severity });
    at = r.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), severity: null });
  return out.length > 0 ? out : [{ text, severity: null }];
}

function Paragraph({ para, issues, focused }: { para: Para; issues: Issue[]; focused: boolean }) {
  const worst = issues.reduce<Severity | null>(
    (w, i) => (w === null || RANK[i.severity as Severity] > RANK[w] ? (i.severity as Severity) : w),
    null,
  );
  return (
    <div
      id={`pratinjau-p-${para.index}`}
      className={cn(
        "rounded-md border-l-4 py-1.5 pl-3 pr-2 [contain-intrinsic-size:auto_3rem] [content-visibility:auto]",
        worst ? EDGE[worst] : "border-transparent",
        focused && "bg-primary-50 ring-2 ring-primary-500",
      )}
    >
      <p
        className={cn(
          "font-serif leading-7 text-ink-800",
          ALIGN[para.align],
          para.kind === "heading" && "mt-3 text-[17px] font-bold text-ink-900",
          para.kind === "toc" && "text-[14px] leading-6 text-ink-500",
          para.kind === "body" && "text-[15px]",
        )}
      >
        {segments(para.text, issues).map((s, i) =>
          s.severity ? (
            <mark
              key={i}
              className={cn(
                "rounded-sm px-0.5 text-ink-900 underline decoration-2 underline-offset-4",
                MARK[s.severity],
              )}
            >
              {s.text}
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </p>
      {issues.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {issues.map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-surface px-2 py-1.5 text-[13px] leading-5 text-ink-700 shadow-xs"
            >
              <SeverityBadge severity={i.severity as Severity} />
              <RuleCode code={i.rule_code} />
              <span className="min-w-0 flex-1">{i.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Body({
  runId,
  issues,
  focusIndex,
}: {
  runId: string;
  issues: Issue[];
  focusIndex: number | null;
}) {
  const p = t.report.preview;
  const { data, error, loading, reload } = useAsync(async () => {
    const hit = cache.get(runId);
    if (hit) return hit;
    const fresh = unwrap(
      await api.GET("/checks/{run_id}/preview", { params: { path: { run_id: runId } } }),
      (e) => toApiError(e).message,
    );
    cache.set(runId, fresh);
    return fresh;
  }, [runId]);

  // Hanya temuan terbuka yang menunjuk paragraf tertentu.
  const byParagraph = useMemo(() => {
    const map = new Map<number, Issue[]>();
    for (const i of issues) {
      const at = i.location.paragraph_index;
      if (i.user_status !== "open" || typeof at !== "number") continue;
      map.set(at, [...(map.get(at) ?? []), i]);
    }
    return map;
  }, [issues]);
  const flagged = useMemo(() => [...byParagraph.keys()].sort((a, b) => a - b), [byParagraph]);

  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [current, setCurrent] = useState<number | null>(focusIndex);
  const scrolled = useRef<number | null>(null);

  // Gulir ke paragraf terpilih setelah teks selesai dimuat.
  useEffect(() => {
    if (!data || current === null || scrolled.current === current) return;
    scrolled.current = current;
    document
      .getElementById(`pratinjau-p-${current}`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [data, current, onlyFlagged]);

  function step(direction: 1 | -1) {
    if (flagged.length === 0) return;
    const after = flagged.find((i) => current === null || i > current);
    const before = [...flagged].reverse().find((i) => current === null || i < current);
    scrolled.current = null;
    setCurrent(direction === 1 ? (after ?? flagged[0]!) : (before ?? flagged[flagged.length - 1]!));
  }

  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  if (loading && !data) return <ListSkeleton rows={6} className="h-14" />;
  if (!data || data.paragraphs.length === 0)
    return <EmptyState icon="thesis" title={p.empty} body={p.emptyBody} />;

  const visible = onlyFlagged
    ? data.paragraphs.filter((x) => byParagraph.has(x.index))
    : data.paragraphs;
  const position = current === null ? -1 : flagged.indexOf(current);

  return (
    <div className="flex flex-col gap-3 pb-3">
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-canvas px-2 py-2">
        <label className="flex min-h-9 items-center gap-2 text-[14px] text-ink-700">
          <input
            type="checkbox"
            checked={onlyFlagged}
            onChange={(e) => setOnlyFlagged(e.target.checked)}
            className="size-4 accent-primary-500"
          />
          {p.onlyFlagged}
        </label>
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] tabular-nums text-ink-500" aria-live="polite">
            {flagged.length === 0
              ? p.noIssues
              : position >= 0
                ? p.counter(position + 1, flagged.length)
                : p.total(flagged.length)}
          </span>
          <Button
            variant="outline"
            className="size-9 min-h-9 px-0"
            aria-label={p.prev}
            disabled={flagged.length === 0}
            onClick={() => step(-1)}
          >
            <Icon name="chevronLeft" />
          </Button>
          <Button
            variant="outline"
            className="size-9 min-h-9 px-0"
            aria-label={p.next}
            disabled={flagged.length === 0}
            onClick={() => step(1)}
          >
            <Icon name="chevronRight" />
          </Button>
        </div>
      </div>
      <p className="text-[13px] leading-5 text-ink-500">{p.note}</p>
      <div className="flex flex-col gap-1.5">
        {visible.map((para) => (
          <Paragraph
            key={para.index}
            para={para}
            issues={byParagraph.get(para.index) ?? []}
            focused={current === para.index}
          />
        ))}
      </div>
    </div>
  );
}

/** Pratinjau teks naskah dengan bagian bermasalah disorot, langsung di aplikasi. */
export function ManuscriptPreview({
  runId,
  issues,
  open,
  focusIndex,
  onClose,
}: {
  runId: string;
  issues: Issue[];
  open: boolean;
  focusIndex: number | null;
  onClose: () => void;
}) {
  const p = t.report.preview;
  return (
    <Modal open={open} onClose={onClose} title={p.title} size="xl" icon="thesis">
      {/* key: pindah ke paragraf lain saat dialog sudah terbuka tetap menggulir ke sana */}
      <Body key={focusIndex ?? "all"} runId={runId} issues={issues} focusIndex={focusIndex} />
    </Modal>
  );
}
