"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { ToastProvider, dismissToast, toast } from "@/components/ui/Toast";
import { t } from "@/lib/i18n/id";

const NETWORK_ID = "network-status";

/** Memberi tahu pengguna saat internet terputus dan saat tersambung kembali. */
function OnlineStatus() {
  useEffect(() => {
    const goOffline = () =>
      toast.warning(t.toast.offline, {
        id: NETWORK_ID,
        title: t.toast.offlineTitle,
        duration: null,
      });
    const goOnline = () => {
      dismissToast(NETWORK_ID);
      toast.success(t.toast.online, { duration: 3000 });
    };
    if (!navigator.onLine) goOffline();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <OnlineStatus />
      {children}
    </ToastProvider>
  );
}
