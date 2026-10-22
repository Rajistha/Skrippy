/** Kunci salinan PDF laporan di Storage: satu per cek, di samping file naskahnya agar ikut terhapus bersamanya. */
export const reportPdfKey = (storageKey: string, runId: string): string =>
  `${storageKey}.${runId}.report.pdf`;
