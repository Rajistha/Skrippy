/** Cincin skor 0-100 dengan gradien hijau. Terisi dalam 800 ms. `size` dalam piksel. */
export function ScoreRing({ value, size = 144 }: { value: number; size?: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Skor ${Math.round(pct)} dari 100`}
    >
      <svg viewBox="0 0 128 128" className="size-full -rotate-90">
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--primary-400)" />
            <stop offset="100%" stopColor="var(--primary-700)" />
          </linearGradient>
        </defs>
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="var(--primary-100)"
          strokeWidth="12"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="url(#ring)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          style={{ transition: "stroke-dashoffset 800ms var(--ease)" }}
        />
      </svg>
      <div
        className="absolute inset-0 grid place-items-center font-display font-bold text-ink-900"
        style={{ fontSize: size * 0.28 }}
      >
        {Math.round(pct)}
      </div>
    </div>
  );
}
