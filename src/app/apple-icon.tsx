import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Ikon layar utama iPhone/iPad. iOS membulatkan sudutnya sendiri, jadi dibuat penuh. */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: 180,
        height: 180,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#155636",
      }}
    >
      <svg width={116} height={116} viewBox="0 0 32 32" fill="none">
        <path
          d="M21 12C21 10 18.8 9 16 9c-3 0-5 1.3-5 3.5 0 2.4 2.2 3.2 5 4s5 1.6 5 4c0 2.2-2 3.5-5 3.5-2.8 0-5-1-5-3"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="23.5" cy="8.5" r="1.9" fill="#8fddb1" />
      </svg>
    </div>,
    size,
  );
}
