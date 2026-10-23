import type { Me } from "./types";

/**
 * Salinan /me terakhir untuk tab ini (sessionStorage, hilang saat tab ditutup). Dipakai agar halaman langsung
 * tampil sambil /me disegarkan di latar belakang, bukan menunggu /me selesai dulu baru memuat data halaman.
 * Dihapus saat keluar, akun dihapus, atau sesi berakhir.
 */
const KEY = "skrippy-me";

export function readCachedMe(): Me | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Me> | null;
    // Bentuk minimal yang dipakai AppShell dan halaman; selain itu dianggap rusak dan dibuang.
    if (typeof value?.profile?.id !== "string" || typeof value.access?.state !== "string")
      return null;
    return value as Me;
  } catch {
    return null;
  }
}

export function writeCachedMe(me: Me): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(me));
  } catch {
    // Penyimpanan penuh atau diblokir: aplikasi tetap jalan tanpa salinan.
  }
}

export function clearCachedMe(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // tidak ada yang perlu dihapus
  }
}
