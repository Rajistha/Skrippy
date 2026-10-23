/**
 * Dipakai hanya untuk login, keluar, dan kata sandi. Dimuat sesuai kebutuhan (import dinamis): supabase-js
 * sekitar 250 KB dan tidak diperlukan untuk menampilkan landing atau halaman aplikasi.
 */
export async function supabaseBrowser() {
  const { createBrowserClient } = await import("@supabase/ssr");
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

/** Mulai mengunduh kode Supabase di latar belakang (halaman masuk), supaya klik pertama tidak menunggu. */
export function warmSupabaseBrowser(): void {
  void import("@supabase/ssr").catch(() => undefined);
}
