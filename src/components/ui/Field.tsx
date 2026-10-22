import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

const CONTROL =
  "min-h-11 w-full rounded-sm border border-ink-400 bg-surface px-3 text-ink-900 " +
  "placeholder:text-ink-400 focus:border-primary-500 focus:outline-none " +
  "focus:ring-4 focus:ring-primary-100";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold leading-4 text-ink-700">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-[13px] leading-5 text-sev-critical">
          <Icon name="critical" /> {error}
        </p>
      ) : (
        hint && <p className="text-[13px] leading-5 text-ink-400">{hint}</p>
      )}
    </div>
  );
}

export function Input({
  className,
  invalid,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cn(CONTROL, invalid && "border-sev-critical", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, "py-2 leading-6", className)} {...rest} />;
}
