/**
 * Kunci salinan PDF laporan di Storage: satu per cek, di samping file naskahnya agar ikut terhapus bersamanya.
 * Angka versi dinaikkan tiap tampilan PDF berubah supaya salinan lama tidak dipakai lagi.
 */
const DESIGN_VERSION = 2;

export const reportPdfKey = (storageKey: string, runId: string): string =>
  `${storageKey}.${runId}.report.v${DESIGN_VERSION}.pdf`;

/** Semua kunci salinan yang mungkin ada (termasuk tampilan lama), untuk penghapusan. */
export const reportPdfKeys = (storageKey: string, runId: string): string[] => [
  reportPdfKey(storageKey, runId),
  `${storageKey}.${runId}.report.pdf`,
];
