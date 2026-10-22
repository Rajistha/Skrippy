import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Menyegarkan sesi Supabase di cookie. Tidak mengakses data apa pun. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  // getClaims memverifikasi tanda tangan JWT secara lokal (kunci publik di-cache) dan hanya menyegarkan
  // sesi bila token hampir habis. Tanpa panggilan jaringan ke Supabase Auth di setiap halaman.
  // Identitas untuk data tetap diverifikasi dengan getUser() di Route Handler (src/server/auth.ts).
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // /api dikecualikan: Route Handler sudah memverifikasi sendiri, jadi tidak perlu dua kali.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)"],
};
