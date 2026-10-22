import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/id";

/** Logomark (huruf S satu goresan dengan titik mint) dan wordmark "skrippy". */
export function Logo({
  tone = "dark",
  size = "md",
  className,
}: {
  tone?: "dark" | "light";
  size?: "sm" | "md";
  className?: string;
}) {
  const isSm = size === "sm";
  return (
    <span className={cn("inline-flex items-center", isSm ? "gap-2" : "gap-2.5", className)}>
      <span
        className={cn(
          "grid place-items-center shadow-sm",
          isSm ? "size-8 rounded-[8px]" : "size-9 rounded-[10px]",
          tone === "light" ? "bg-white/20 text-white backdrop-blur-sm" : "bg-hero text-white",
        )}
      >
        <svg
          viewBox="0 0 32 32"
          className={isSm ? "size-8" : "size-9"}
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M21 12C21 10 18.8 9 16 9c-3 0-5 1.3-5 3.5 0 2.4 2.2 3.2 5 4s5 1.6 5 4c0 2.2-2 3.5-5 3.5-2.800 0-5-1-5-3"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="23.5" cy="8.5" r="1.9" className="fill-accent-300" />
        </svg>
      </span>
      <span
        className={cn(
          "font-display font-bold tracking-[-0.02em]",
          isSm ? "text-[20px]" : "text-[22px]",
          tone === "light" ? "text-white" : "text-primary-500",
        )}
      >
        {t.app.name}
      </span>
    </span>
  );
}
