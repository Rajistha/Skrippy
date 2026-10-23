import type { MetadataRoute } from "next";

/** Manifest PWA. Warna mengikuti token merek (hutan) di docs/DESIGN.md. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Skrippy: pemeriksa naskah skripsi",
    short_name: "Skrippy",
    description: "Periksa format, struktur, ejaan, dan sitasi naskah skripsimu sebelum bimbingan.",
    lang: "id",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f4f1",
    theme_color: "#1f7a4e",
    categories: ["education", "productivity"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Skripsi saya",
        url: "/skripsi",
        icons: [{ src: "/pwa-icon/192", sizes: "192x192" }],
      },
      { name: "Riwayat cek", url: "/riwayat", icons: [{ src: "/pwa-icon/192", sizes: "192x192" }] },
    ],
  };
}
