import { createBrowserClient } from "@supabase/ssr";

/** Dipakai hanya untuk login Google, keluar, dan mengambil access token. */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}
