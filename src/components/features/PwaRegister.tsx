"use client";

import { useEffect } from "react";
import { startPwaInstallTracking } from "@/lib/use-pwa-install";

/**
 * Mendaftarkan service worker (hanya di produksi, supaya `next dev` tidak terjebak cache lama)
 * dan mulai menangkap peristiwa "bisa dipasang" sedini mungkin.
 */
export function PwaRegister() {
  useEffect(() => {
    startPwaInstallTracking();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
