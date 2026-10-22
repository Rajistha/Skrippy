/**
 * Unggah ke signed upload URL dari API (bukan ke tabel atau storage lewat Supabase JS).
 * Dipisah di sini agar mudah diganti bila backend storage berubah.
 */
export function putToSignedUrl(
  url: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`));
    xhr.onerror = () => reject(new Error("network"));
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    xhr.send(form);
  });
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function validateFile(file: File): "ok" | "not_docx" | "too_big" {
  if (!file.name.toLowerCase().endsWith(".docx")) return "not_docx";
  if (file.size > MAX_UPLOAD_BYTES) return "too_big";
  return "ok";
}
