import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/id";

/** Grafik SVG ringan untuk panel admin. Warna hanya dari token; angka selalu tersedia sebagai teks (sr-only atau legenda). */

const nf = new Intl.NumberFormat("id-ID");

/** Angka sumbu y yang rapi: kelipatan 1, 2, 5, 10 ... di atas nilai maksimum. */
function niceMax(max: number): number {
  if (max <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  const step = n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export type BarDatum = { label: string; value: number; extra?: number };

/** Batang bertumpuk: `value` (utama) dan `extra` (misal gagal) di atasnya. */
export function BarChart({
  data,
  valueLabel,
  extraLabel,
  className,
}: {
  data: BarDatum[];
  valueLabel: string;
  extraLabel?: string;
  className?: string;
}) {
  const W = 560;
  const H = 200;
  const pad = { l: 32, r: 8, t: 10, b: 26 };
  const max = niceMax(Math.max(1, ...data.map((d) => d.value + (d.extra ?? 0))));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const slot = innerW / Math.max(1, data.length);
  const bar = Math.min(26, slot * 0.62);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const labelEvery = data.length > 10 ? 2 : 1;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${valueLabel}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}
        className="h-auto w-full"
      >
        {ticks.map((tk) => (
          <g key={tk}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(tk)}
              y2={y(tk)}
              className="stroke-ink-100"
              strokeWidth="1"
              strokeDasharray={tk === 0 ? undefined : "3 4"}
            />
            <text x={pad.l - 6} y={y(tk) + 3} textAnchor="end" className="fill-ink-500 text-[10px]">
              {tk}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const extra = d.extra ?? 0;
          return (
            <g key={d.label + i}>
              <title>
                {`${d.label}: ${d.value} ${valueLabel.toLowerCase()}${
                  extra && extraLabel ? `, ${extra} ${extraLabel.toLowerCase()}` : ""
                }`}
              </title>
              {d.value > 0 && (
                <rect
                  x={cx - bar / 2}
                  y={y(d.value)}
                  width={bar}
                  height={Math.max(2, innerH - (y(d.value) - pad.t))}
                  rx="4"
                  className="fill-primary-500"
                />
              )}
              {extra > 0 && (
                <rect
                  x={cx - bar / 2}
                  y={y(d.value + extra) - 1}
                  width={bar}
                  height={Math.max(3, y(d.value) - y(d.value + extra) - 1)}
                  rx="3"
                  className="fill-sev-critical"
                />
              )}
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" className="fill-ink-500 text-[10px]">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-sm bg-primary-500" /> {valueLabel}
        </span>
        {extraLabel && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-sm bg-sev-critical" /> {extraLabel}
          </span>
        )}
      </div>
    </div>
  );
}

/** Garis berlatar gradien untuk deret waktu. */
export function AreaChart({
  data,
  label,
  className,
}: {
  data: Array<{ label: string; value: number }>;
  label: string;
  className?: string;
}) {
  const W = 560;
  const H = 200;
  const pad = { l: 32, r: 12, t: 14, b: 26 };
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (data.length <= 1 ? 0 : (i * innerW) / (data.length - 1));
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`).join(" ");
  const area = data.length ? `${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : "";
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const labelEvery = data.length > 10 ? 2 : 1;
  const gradId = `area-${label.replace(/\W/g, "")}`;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${label}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}
        className="h-auto w-full text-primary-500"
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tk) => (
          <g key={tk}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(tk)}
              y2={y(tk)}
              className="stroke-ink-100"
              strokeWidth="1"
              strokeDasharray={tk === 0 ? undefined : "3 4"}
            />
            <text x={pad.l - 6} y={y(tk) + 3} textAnchor="end" className="fill-ink-500 text-[10px]">
              {tk}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={d.label + i}>
            <title>{`${d.label}: ${d.value}`}</title>
            <circle
              cx={x(i)}
              cy={y(d.value)}
              r="3.5"
              className="fill-surface stroke-primary-500"
              strokeWidth="2"
            />
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-ink-500 text-[10px]">
                {d.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export type DonutSlice = { label: string; value: number; className: string };

/** Donat dengan legenda berangka. `className` slice berupa kelas stroke-* token. */
export function Donut({
  slices,
  centerValue,
  centerLabel,
  className,
}: {
  slices: DonutSlice[];
  centerValue: string;
  centerLabel: string;
  className?: string;
}) {
  const total = slices.reduce((n, s) => n + s.value, 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-8 gap-y-4", className)}>
      <svg viewBox="0 0 140 140" className="size-36 shrink-0" role="img" aria-label={centerLabel}>
        <circle cx="70" cy="70" r={r} fill="none" strokeWidth="16" className="stroke-ink-100" />
        {total > 0 &&
          slices.map((s) => {
            const len = (s.value / total) * c;
            const dash = `${Math.max(0, len - (slices.length > 1 ? 2 : 0))} ${c}`;
            const el = (
              <circle
                key={s.label}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                strokeWidth="16"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
                className={s.className}
              >
                <title>{`${s.label}: ${s.value}`}</title>
              </circle>
            );
            offset += len;
            return s.value > 0 ? el : null;
          })}
        <text
          x="70"
          y="68"
          textAnchor="middle"
          className="fill-ink-900 font-display text-[22px] font-bold"
        >
          {centerValue}
        </text>
        <text x="70" y="86" textAnchor="middle" className="fill-ink-500 text-[10px]">
          {centerLabel}
        </text>
      </svg>
      <ul className="flex min-w-[140px] flex-1 flex-col gap-2 text-[13px]">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "size-2.5 shrink-0 rounded-full",
                s.className.replace("stroke-", "bg-"),
              )}
            />
            <span className="text-ink-700">{s.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-ink-900">
              {nf.format(s.value)}
              {total > 0 && (
                <span className="ml-1 font-normal text-ink-500">
                  ({Math.round((s.value / total) * 100)}%)
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Batang pemakaian terhadap kuota. Mendekati batas berubah warna dan diberi teks. */
export function Meter({
  label,
  used,
  limit,
  format,
}: {
  label: string;
  used: number;
  limit: number;
  format: (n: number) => string;
}) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const pct = Math.round(ratio * 1000) / 10;
  const tone = ratio >= 0.9 ? "bg-sev-critical" : ratio >= 0.7 ? "bg-sev-major" : "bg-primary-500";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-semibold text-ink-900">{label}</span>
        <span className="tabular-nums text-ink-500">
          {format(used)} / {format(limit)} ({String(pct).replace(".", ",")}%)
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        className="h-2.5 overflow-hidden rounded-full bg-primary-100"
      >
        <div
          className={cn("h-full rounded-full transition-[width]", tone)}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      {ratio >= 0.7 && (
        <p className="text-[12px] font-semibold text-sev-major">
          {ratio >= 0.9 ? t.system.quotaFull : t.system.quotaNear}
        </p>
      )}
    </div>
  );
}
