import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Hanya jalur internal yang diterima sebagai tujuan setelah masuk (cegah open redirect). */
function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

/** Menukar kode OAuth Google dengan sesi, lalu lanjut ke tukar kode, tujuan semula, atau dashboard. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const kode = searchParams.get("kode");
  const next = safeNext(searchParams.get("next"));

  // Pengguna menolak izin di layar Google, atau Supabase mengembalikan galat.
  const oauthError = searchParams.get("error");
  if (oauthError) {
    const reason = oauthError === "access_denied" ? "access_denied" : "oauth_failed";
    return NextResponse.redirect(`${origin}/masuk?error=${reason}`);
  }

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const target = kode ? `/tukar-kode?kode=${encodeURIComponent(kode)}` : (next ?? "/dashboard");
      return NextResponse.redirect(`${origin}${target}`);
    }
  }
  return NextResponse.redirect(`${origin}/masuk?error=oauth_failed`);
}
