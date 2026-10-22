"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { api } from "@/lib/api/client";
import { t } from "@/lib/i18n/id";
import type { ScoreTrendPoint } from "@/lib/schemas";

const W = 320;
const H = 120;
const PAD = { x: 24, top: 12, bottom: 24 };

/** Skor antarversi naskah. Tampil hanya bila ada dua versi atau lebih; gagal memuat tidak mengganggu laporan. */
export function TrendChart({ runId }: { runId: string }) {
  const [points, setPoints] = useState<ScoreTrendPoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .GET("/checks/{run_id}/trend", { params: { path: { run_id: runId } } })
      .then(({ data }) => {
        if (!cancelled && data) setPoints(data);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (!points || points.length < 2) return null;
  const x = (i: number): number => PAD.x + (i * (W - PAD.x * 2)) / (points.length - 1);
  const y = (score: number): number => PAD.top + ((100 - score) * (H - PAD.top - PAD.bottom)) / 100;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.score_total)}`).join(" ");
  const summary = points
    .map((p) => `versi ${p.version_no}: ${Math.round(p.score_total)}`)
    .join(", ");

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-display text-[18px] font-semibold text-ink-900">
        <Icon name="chart" /> {t.report.trend.title}
      </h2>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${t.report.trend.title}: ${summary}`}
        className="w-full max-w-md"
      >
        <path d={path} fill="none" className="stroke-primary-500" strokeWidth="2" />
        {points.map((p, i) => (
          <g key={p.run_id}>
            <circle cx={x(i)} cy={y(p.score_total)} r="4" className="fill-primary-500" />
            <text
              x={x(i)}
              y={y(p.score_total) - 8}
              textAnchor="middle"
              className="fill-ink-900 text-[10px] font-semibold"
            >
              {Math.round(p.score_total)}
            </text>
            <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-ink-500 text-[10px]">
              V{p.version_no}
            </text>
          </g>
        ))}
      </svg>
      <ul className="sr-only">
        {points.map((p) => (
          <li key={p.run_id}>
            {t.report.trend.version(p.version_no)}: {Math.round(p.score_total)}
          </li>
        ))}
      </ul>
    </Card>
  );
}
