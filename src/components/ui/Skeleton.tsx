import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/id";
import { Icon } from "./Icon";

/** Blok kerangka saat data dimuat. Dekoratif: pembaca layar mendapat label dari pembungkusnya. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-ink-100", className)} />
  );
}

export function Spinner({
  label = t.common.loading,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-ink-500", className)}>
      <Icon name="spinner" spin />
      <span>{label}</span>
    </span>
  );
}

/** Layar penuh saat sesi dimuat. */
export function PageLoader() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true">
      <Spinner className="text-[15px]" />
    </div>
  );
}
