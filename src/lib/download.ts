import { t } from "./i18n/id";

/** Unduh berkas lewat fetch lalu simpan di browser. Mengembalikan jumlah perubahan bila server menyebutnya. */
export async function downloadFile(href: string): Promise<{ changes: number | null }> {
  const res = await fetch(href);
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? (body as { error?: { message?: string } }).error?.message
        : undefined;
    throw new Error(message ?? t.toast.downloadFailed);
  }
  const name =
    /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "naskah";
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  const header = res.headers.get("x-skrippy-changes");
  return { changes: header === null ? null : Number(header) };
}
