import { cn } from "@/lib/cn";

export type Bar = { label: string; value: number | null; highlight?: "best" | "latest" };

/**
 * Batang pil per versi. Tinggi sebanding skor; versi tanpa skor memakai pola garis.
 * Setiap batang menampilkan angkanya sebagai teks, jadi bacaannya tidak bergantung pada warna.
 */
export function PillBars({ bars, ariaLabel }: { bars: Bar[]; ariaLabel: string }) {
  return (
    <ul className="flex h-56 items-end justify-between gap-2 sm:gap-3" aria-label={ariaLabel}>
      {bars.map((bar, i) => {
        const hasValue = bar.value !== null;
        const height = hasValue ? Math.max(18, Math.min(100, bar.value ?? 0)) : 72;
        return (
          <li
            key={`${bar.label}-${i}`}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
          >
            <span
              className={cn(
                "text-[12px] font-semibold leading-4",
                bar.highlight === "best" ? "text-primary-700" : "text-ink-500",
              )}
            >
              {hasValue ? Math.round(bar.value ?? 0) : "–"}
            </span>
            <span
              aria-hidden="true"
              style={{ height: `${height}%` }}
              className={cn(
                "w-full max-w-[56px] rounded-full transition-[height] duration-700",
                !hasValue && "stripes",
                hasValue && bar.highlight === "best" && "bg-primary-800",
                hasValue && bar.highlight === "latest" && "bg-primary-500",
                hasValue && !bar.highlight && "bg-primary-300",
              )}
            />
            <span className="text-[12px] leading-4 text-ink-500">{bar.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Setengah lingkaran skor total dengan angka besar di tengah. Bagian kosong memakai pola garis. */
export function SemiGauge({ value, caption }: { value: number | null; caption: string }) {
  const r = 80;
  const arc = Math.PI * r; // panjang setengah lingkaran
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const path = `M ${100 - r} 100 A ${r} ${r} 0 0 1 ${100 + r} 100`;
  return (
    <div
      className="relative mx-auto w-full max-w-[280px]"
      role="img"
      aria-label={`${caption}: ${value === null ? "belum ada" : Math.round(pct)}`}
    >
      <svg viewBox="0 0 200 110" className="w-full" aria-hidden="true">
        <defs>
          <pattern
            id="gauge-stripes"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="var(--ink-400)"
              strokeWidth="2"
              opacity="0.55"
            />
          </pattern>
        </defs>
        <path
          d={path}
          fill="none"
          stroke="url(#gauge-stripes)"
          strokeWidth="22"
          strokeLinecap="round"
        />
        <path
          d={path}
          fill="none"
          stroke="var(--primary-500)"
          strokeWidth="22"
          strokeLinecap="round"
          strokeDasharray={arc}
          strokeDashoffset={arc * (1 - pct / 100)}
          style={{ transition: "stroke-dashoffset 800ms var(--ease)" }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="font-display text-[40px] font-bold leading-[44px] text-ink-900">
          {value === null ? "–" : Math.round(pct)}
          {value !== null && <span className="text-[20px]">%</span>}
        </p>
        <p className="text-[13px] leading-5 text-ink-500">{caption}</p>
      </div>
    </div>
  );
}

/** Batang tipis untuk satu kategori (nilai 0-100). */
export function MiniBar({ value }: { value: number }) {
  return (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
      <span
        className="block h-full rounded-full bg-primary-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </span>
  );
}
