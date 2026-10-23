"use client";

import { useSyncExternalStore } from "react";

/** Cookie sesi Supabase (sb-<proyek>-auth-token, bisa terpecah .0 .1). Hanya penanda adanya sesi, isinya tidak dibaca. */
const SESSION_COOKIE = /(?:^|;\s*)sb-[^=;]*-auth-token(?:\.\d+)?=/;

const subscribe = () => () => undefined;

/**
 * Status masuk untuk menyesuaikan tampilan publik (null = belum diketahui). Hanya tampilan; akses data tetap
 * diverifikasi server. Cukup membaca cookie, jadi landing tidak perlu memuat supabase-js (sekitar 250 KB).
 */
export function useSignedIn(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => SESSION_COOKIE.test(document.cookie),
    () => null,
  );
}
