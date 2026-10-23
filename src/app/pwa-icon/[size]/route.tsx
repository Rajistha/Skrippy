import { ImageResponse } from "next/og";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ size: string }> };

const SIZES = { "192": 192, "512": 512, maskable: 512 } as const;

/** Logomark yang sama dengan src/app/icon.svg, digambar ke PNG untuk ikon PWA. */
function Mark({ px, bleed }: { px: number; bleed: boolean }) {
  // Ikon maskable: semua isi harus di dalam lingkaran aman (40% tengah), jadi glif diperkecil.
  const glyph = bleed ? px * 0.58 : px * 0.72;
  return (
    <div
      style={{
        width: px,
        height: px,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#155636",
        borderRadius: bleed ? 0 : px * 0.28,
      }}
    >
      <svg width={glyph} height={glyph} viewBox="0 0 32 32" fill="none">
        <path
          d="M21 12C21 10 18.8 9 16 9c-3 0-5 1.3-5 3.5 0 2.4 2.2 3.2 5 4s5 1.6 5 4c0 2.2-2 3.5-5 3.5-2.8 0-5-1-5-3"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="23.5" cy="8.5" r="1.9" fill="#8fddb1" />
      </svg>
    </div>
  );
}

export async function GET(_request: Request, { params }: Ctx) {
  const key = (await params).size;
  if (!(key in SIZES)) return new Response(null, { status: 404 });
  const px = SIZES[key as keyof typeof SIZES];
  return new ImageResponse(<Mark px={px} bleed={key === "maskable"} />, {
    width: px,
    height: px,
    headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" },
  });
}
