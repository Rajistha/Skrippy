import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  // Memungkinkan dev/build kedua berjalan berdampingan (misal untuk uji performa) tanpa bentrok folder .next.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Jangan biarkan `next dev` menulis blok otomatis ke AGENTS.md.
  agentRules: false,
  // Lencana dev Next.js menutupi avatar di sidebar; tidak dibutuhkan.
  devIndicators: false,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async redirects() {
    return [{ source: "/akses", destination: "/profil", permanent: true }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
