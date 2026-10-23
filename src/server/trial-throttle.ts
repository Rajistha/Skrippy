/**
 * Pemeriksaan "apakah akun ini berhak mendapat trial" (grantTrialIfEligible) berupa transaksi database
 * (BEGIN, SELECT FOR UPDATE, baca pengaturan, COMMIT). Akun yang trial-nya tidak pernah berlaku, misalnya
 * pengguna yang hanya menukar kode paket, selalu lolos syarat `trialUsed = false`, sehingga tanpa pembatas
 * transaksi itu berjalan di SETIAP permintaan API. Cukup sekali per menit per akun per instance.
 */
export const TRIAL_RECHECK_MS = 60_000;
const MAX_TRACKED = 1000;

const checkedAt = new Map<string, number>();

/** True bila akun ini perlu diperiksa sekarang. Memanggilnya menandai akun sebagai baru diperiksa. */
export function shouldCheckTrial(userId: string, now: number = Date.now()): boolean {
  const last = checkedAt.get(userId);
  if (last !== undefined && now - last < TRIAL_RECHECK_MS) return false;
  // Batas ukuran supaya instance yang hidup lama tidak menyimpan daftar tanpa akhir.
  if (checkedAt.size >= MAX_TRACKED) checkedAt.clear();
  checkedAt.set(userId, now);
  return true;
}

/** Untuk uji. */
export function resetTrialThrottle(): void {
  checkedAt.clear();
}
