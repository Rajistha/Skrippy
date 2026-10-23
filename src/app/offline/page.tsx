import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { OfflineActions } from "./OfflineActions";
import { t } from "@/lib/i18n/id";

export const metadata: Metadata = { title: t.pwa.offline.title, robots: { index: false } };

/** Halaman cadangan yang dipakai service worker saat tidak ada internet dan halaman belum pernah dibuka. */
export default function OfflinePage() {
  const o = t.pwa.offline;
  return (
    <main
      id="konten"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-5 p-6 text-center"
    >
      <Logo />
      <h1 className="font-display text-[26px] font-semibold leading-8 text-ink-900">{o.title}</h1>
      <p className="text-[15px] leading-6 text-ink-500">{o.body}</p>
      <OfflineActions />
    </main>
  );
}
