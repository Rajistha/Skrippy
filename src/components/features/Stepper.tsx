import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

/** Stepper kecil: langkah selesai bertanda centang, langkah aktif ditebalkan. */
export function Stepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2 text-[13px]" aria-label="Langkah">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 font-semibold",
              active ? "text-primary-600" : done ? "text-sev-success" : "text-ink-400",
            )}
          >
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full text-[12px]",
                active
                  ? "bg-primary-500 text-on-primary"
                  : done
                    ? "bg-sev-success-bg"
                    : "bg-ink-100",
              )}
            >
              {done ? <Icon name="done" /> : i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
            {i < steps.length - 1 && (
              <span className="h-px w-4 bg-ink-200 sm:w-8" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
