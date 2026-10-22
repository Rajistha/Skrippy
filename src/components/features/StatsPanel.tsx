import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { t } from "@/lib/i18n/id";
import type { CheckRun } from "@/lib/types";

type Stats = NonNullable<CheckRun["stats"]>;

const nf = new Intl.NumberFormat("id-ID");
const pct = (n: number): string => `${String(n).replace(".", ",")}%`;

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-primary-50 p-3">
      <p className="font-display text-[20px] font-semibold leading-7 text-ink-900">{value}</p>
      <p className="text-[13px] font-semibold leading-4 text-ink-700">{label}</p>
    </div>
  );
}

/** Ringkasan naskah: bukan temuan dan tidak memengaruhi skor. */
export function StatsPanel({ stats }: { stats: Stats }) {
  const s = t.report.stats;
  const maxWords = Math.max(1, ...stats.chapters.map((c) => c.words));
  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-[18px] font-semibold text-ink-900">
          <Icon name="chart" /> {s.title}
        </h2>
        <p className="text-[13px] leading-5 text-ink-500">{s.note}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Figure label={s.words} value={nf.format(stats.words)} />
        <Figure label={s.paragraphs} value={nf.format(stats.paragraphs)} />
        <Figure label={s.tables} value={nf.format(stats.tables)} />
        <Figure label={s.figures} value={nf.format(stats.figures)} />
        <Figure label={s.footnotes} value={nf.format(stats.footnotes)} />
      </div>
      {stats.chapters.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[13px]">
            <thead>
              <tr className="text-ink-500">
                <th className="py-2 pr-3 font-semibold">{s.chapter}</th>
                <th className="py-2 pr-3 font-semibold">{s.chapterWords}</th>
                <th className="w-1/2 py-2 pr-3 font-semibold">
                  <span className="sr-only">{s.chapterWords}</span>
                </th>
                <th className="py-2 font-semibold">{s.chapterCitations}</th>
              </tr>
            </thead>
            <tbody>
              {stats.chapters.map((c) => (
                <tr key={c.name} className="border-t border-ink-100">
                  <td className="py-2 pr-3 font-semibold text-ink-900">{c.name}</td>
                  <td className="py-2 pr-3 tabular-nums">{nf.format(c.words)}</td>
                  <td className="py-2 pr-3" aria-hidden="true">
                    <div className="h-2 rounded-full bg-primary-100">
                      <div
                        className="h-2 rounded-full bg-primary-500"
                        style={{ width: `${Math.round((c.words / maxWords) * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-2 tabular-nums">{c.citations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-[14px] font-semibold text-ink-900">{s.readability}</h3>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[13px]">
            <dt className="text-ink-500">{s.sentences}</dt>
            <dd className="font-semibold tabular-nums">{nf.format(stats.readability.sentences)}</dd>
            <dt className="text-ink-500">{s.avgSentence}</dt>
            <dd className="font-semibold tabular-nums">
              {String(stats.readability.avgSentenceWords).replace(".", ",")}
            </dd>
            <dt className="text-ink-500">{s.longSentences}</dt>
            <dd className="font-semibold tabular-nums">{pct(stats.readability.longSentencePct)}</dd>
            <dt className="text-ink-500">{s.passive}</dt>
            <dd className="font-semibold tabular-nums">{pct(stats.readability.passivePct)}</dd>
          </dl>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-[14px] font-semibold text-ink-900">{s.sources}</h3>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[13px]">
            <dt className="text-ink-500">{s.sourceTotal}</dt>
            <dd className="font-semibold tabular-nums">{stats.sources.total}</dd>
            <dt className="text-ink-500">{s.sourceRecent}</dt>
            <dd className="font-semibold tabular-nums">
              {stats.sources.recentPct === null ? "-" : `${stats.sources.recentPct}%`}
            </dd>
            <dt className="text-ink-500">{s.sourceMedian}</dt>
            <dd className="font-semibold tabular-nums">{stats.sources.medianYear ?? "-"}</dd>
          </dl>
        </div>
      </div>
    </Card>
  );
}
