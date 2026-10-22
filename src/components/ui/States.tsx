import { t } from "@/lib/i18n/id";
import { Alert } from "./Alert";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Skeleton } from "./Skeleton";

/** Kondisi gagal memuat: pesan jelas dan tombol coba lagi. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert
      tone="error"
      title={t.common.loadFailed}
      action={
        <Button variant="secondary" onClick={onRetry}>
          <Icon name="refresh" /> {t.common.retry}
        </Button>
      }
    >
      {message}
    </Alert>
  );
}

/** Kerangka daftar saat memuat. */
export function ListSkeleton({
  rows = 3,
  className = "h-16",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={t.common.loading}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={`${className} w-full rounded-lg`} />
      ))}
    </div>
  );
}
