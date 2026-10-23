"use client";

import { useCallback, useSyncExternalStore } from "react";
import { detectPlatform, isInAppBrowser, isStandalone, type InstallPlatform } from "./pwa";

/** Peristiwa Chrome/Edge yang belum ada di tipe DOM standar. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallStatus =
  /** Belum diketahui (render di server). */
  | "unknown"
  /** Sudah berjalan sebagai aplikasi terpasang. */
  | "installed"
  /** Browser siap menampilkan dialog pasang lewat tombol. */
  | "ready"
  /** Pasang lewat langkah manual (iPhone/iPad, atau browser yang tidak menyediakan dialog). */
  | "manual";

let deferred: InstallPromptEvent | null = null;
let installed = false;
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Pasang pendengar sekali saja. beforeinstallprompt datang lebih awal dari komponen mana pun, jadi ditangkap di sini. */
export function startPwaInstallTracking(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  installed = isStandalone();
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });
}

const SERVER_SNAPSHOT = "unknown|desktop|0";

function snapshot(): string {
  const status: InstallStatus = installed ? "installed" : deferred ? "ready" : "manual";
  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  return `${status}|${platform}|${isInAppBrowser(navigator.userAgent) ? 1 : 0}`;
}

function subscribe(listener: () => void): () => void {
  startPwaInstallTracking();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Status pemasangan PWA dan tombol pasang. `inApp` true bila dibuka di browser dalam aplikasi lain. */
export function usePwaInstall(): {
  status: InstallStatus;
  platform: InstallPlatform;
  inApp: boolean;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
} {
  const raw = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  const [status, platform, inApp] = raw.split("|") as [InstallStatus, InstallPlatform, string];
  const install = useCallback(async () => {
    if (!deferred) return "unavailable" as const;
    const event = deferred;
    await event.prompt();
    const { outcome } = await event.userChoice;
    // Dialog hanya bisa dipakai sekali.
    deferred = null;
    emit();
    return outcome;
  }, []);
  return { status, platform, inApp: inApp === "1", install };
}
