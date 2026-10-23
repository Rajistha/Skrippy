/** Bantuan PWA di sisi browser: deteksi perangkat, status terpasang, dan penghapusan salinan offline. */
import { clearCachedMe } from "./session-cache";

export type InstallPlatform = "ios" | "android" | "desktop";

/** Awalan semua cache milik service worker (public/sw.js). Dipakai juga untuk menghapusnya saat keluar. */
export const CACHE_PREFIX = "skrippy-";

export function detectPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  // iPadOS 13+ mengaku sebagai Mac; layar sentuh membedakannya dari Mac biasa.
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1))
    return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

/** Browser dalam aplikasi (Instagram, Facebook, LINE, dan sejenisnya) tidak bisa memasang PWA. */
export function isInAppBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|Instagram|Line\/|; wv\)|MicroMessenger|TikTok/i.test(userAgent);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

/** Hapus data yang disimpan untuk dipakai offline. Dipanggil saat keluar dan saat sesi berakhir. */
export async function clearOfflineData(): Promise<void> {
  clearCachedMe();
  if (typeof caches === "undefined") return;
  try {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith(CACHE_PREFIX)).map((n) => caches.delete(n)));
  } catch {
    // Penyimpanan bisa diblokir (mode pribadi); tidak ada yang perlu dihapus.
  }
}
