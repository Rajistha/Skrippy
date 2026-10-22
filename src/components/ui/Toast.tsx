"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n/id";
import { TONE_STYLE, type AlertTone } from "./Alert";
import { Icon } from "./Icon";

export type ToastInput = {
  message: string;
  title?: string;
  tone?: AlertTone;
  /** ms. null = tetap tampil sampai ditutup. Default: 5 detik, 8 detik untuk kesalahan. */
  duration?: number | null;
  action?: { label: string; onClick: () => void };
  /** Toast dengan id yang sama menggantikan yang lama (mis. status koneksi). */
  id?: string;
};

type ToastItem = Required<Pick<ToastInput, "message" | "tone" | "id">> &
  Omit<ToastInput, "message" | "tone" | "id">;

const MAX_VISIBLE = 4;
let counter = 0;
type Listener = (input: ToastInput) => void;
type DismissListener = (id: string) => void;
const addListeners = new Set<Listener>();
const dismissListeners = new Set<DismissListener>();

/** Bisa dipanggil dari luar React (mis. klien API saat sesi berakhir). */
export function emitToast(input: ToastInput): string {
  const id = input.id ?? `toast-${++counter}`;
  addListeners.forEach((l) => l({ ...input, id }));
  return id;
}
export function dismissToast(id: string): void {
  dismissListeners.forEach((l) => l(id));
}

const make =
  (tone: AlertTone) =>
  (message: string, opts: Omit<ToastInput, "message" | "tone"> = {}) =>
    emitToast({ ...opts, message, tone });

export const toast = {
  success: make("success"),
  error: make("error"),
  warning: make("warning"),
  info: make("info"),
  dismiss: dismissToast,
};

const ToastContext = createContext(toast);
export const useToast = () => useContext(ToastContext);

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const style = TONE_STYLE[item.tone];
  const duration =
    item.duration === undefined ? (item.tone === "error" ? 8000 : 5000) : item.duration;
  const remaining = useRef(duration ?? 0);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const start = useCallback(() => {
    if (duration === null) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(onDismiss, remaining.current);
  }, [duration, onDismiss]);
  const pause = useCallback(() => {
    if (duration === null || !timer.current) return;
    clearTimeout(timer.current);
    remaining.current -= Date.now() - startedAt.current;
  }, [duration]);

  useEffect(() => {
    start();
    return () => clearTimeout(timer.current);
  }, [start]);

  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      onMouseEnter={pause}
      onMouseLeave={start}
      onFocus={pause}
      onBlur={start}
      className="rise pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-ink-200 bg-surface p-4 shadow-lg"
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-[16px]",
          style.box,
        )}
      >
        <Icon name={style.icon} />
      </span>
      <div className="min-w-0 flex-1 text-[14px] leading-5">
        <p className="font-semibold text-ink-900">
          <span className="sr-only">{style.label}: </span>
          {item.title ?? style.label}
        </p>
        <p className="mt-0.5 text-ink-500">{item.message}</p>
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              onDismiss();
            }}
            className="mt-2 min-h-8 text-[13px] font-semibold text-primary-600 underline-offset-2 hover:underline"
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t.common.close}
        className="-mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-900"
      >
        <Icon name="close" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onAdd: Listener = (input) => {
      const item: ToastItem = {
        ...input,
        tone: input.tone ?? "info",
        id: input.id ?? `toast-${++counter}`,
      };
      setItems((cur) => [item, ...cur.filter((x) => x.id !== item.id)].slice(0, MAX_VISIBLE));
    };
    const onDismiss: DismissListener = (id) => setItems((cur) => cur.filter((x) => x.id !== id));
    addListeners.add(onAdd);
    dismissListeners.add(onDismiss);
    return () => {
      addListeners.delete(onAdd);
      dismissListeners.delete(onDismiss);
    };
  }, []);

  const value = useMemo(() => toast, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <section
        aria-label={t.common.notifications}
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:flex-col-reverse sm:items-end sm:px-0"
      >
        {items.map((item) => (
          <ToastCard
            key={item.id}
            item={item}
            onDismiss={() => setItems((cur) => cur.filter((x) => x.id !== item.id))}
          />
        ))}
      </section>
    </ToastContext.Provider>
  );
}
