const ALPHABET = /[A-Z0-9]/g;

/**
 * Bentuk tampilan kode saat mengetik: huruf kapital, tanda hubung disisipkan otomatis.
 * Tempelan dari WhatsApp (dengan spasi atau tanpa prefiks) tetap diterima.
 */
export function formatCodeInput(raw: string): string {
  let body = (raw.toUpperCase().match(ALPHABET) ?? []).join("");
  // Awalan "SKR-" yang ditambahkan kolom sendiri selalu dibuang. Pengguna yang mengetik atau menempel
  // awalannya lagi (kode jadi lebih dari 8 karakter) juga dibuang, sehingga mengetik "SKR-ABCD-EFGH"
  // huruf demi huruf menghasilkan kode yang benar, bukan "SKR-SKRA-BCDE".
  if (/^\s*SKR-/i.test(raw)) body = body.slice(3);
  if (body.length > 8 && body.startsWith("SKR")) body = body.slice(3);
  body = body.slice(0, 8);
  if (body.length === 0) return raw.trim() === "" ? "" : "SKR-";
  const parts = [body.slice(0, 4), body.slice(4)].filter(Boolean);
  return `SKR-${parts.join("-")}`;
}

export function isCodeComplete(value: string): boolean {
  return /^SKR-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value);
}

/** Rp25.000, tanpa desimal. */
export function formatRupiah(amount: number): string {
  return `Rp${Math.round(amount).toLocaleString("id-ID")}`;
}

/** Tanggal dalam WIB, misal "3 November 2026". */
export function formatDateWib(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

export function formatDateTimeWib(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

export function whatsappLink(number: string, text?: string): string {
  const digits = number.replace(/\D/g, "");
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${query}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2).replace(".", ",")} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
