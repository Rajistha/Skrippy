"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PageLoader } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { api, toApiError, UNAUTHORIZED_EVENT } from "@/lib/api/client";
import { t } from "@/lib/i18n/id";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Me } from "@/lib/types";

type SessionValue = {
  me: Me;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

// Mencegah pengalihan ke halaman masuk berulang bila beberapa permintaan serentak sama-sama 401.
let expiring = false;

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession harus dipakai di dalam SessionProvider");
  return value;
}

/**
 * Memuat /me. Token tidak valid -> halaman masuk (dengan tujuan semula, `next`).
 * Token valid tanpa profil (403 access_code_required) -> halaman tukar kode.
 * Sesi yang berakhir di tengah pemakaian (401 dari API mana pun) ditangani sama, dengan pemberitahuan.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const toLogin = useCallback(() => {
    if (expiring) return;
    expiring = true;
    toast.warning(t.toast.sessionExpired, {
      title: t.toast.sessionExpiredTitle,
      id: "session-expired",
    });
    router.replace(`/masuk?error=session_expired&next=${encodeURIComponent(pathname)}`);
  }, [router, pathname]);

  const load = useCallback(async () => {
    const { data, error, response } = await api.GET("/me");
    if (data) {
      expiring = false;
      setMe(data);
      setFailed(null);
      return;
    }
    const err = toApiError(error);
    if (response?.status === 401) toLogin();
    else if (err.code === "access_code_required") router.replace("/tukar-kode");
    else setFailed(err.code === "network" ? t.errors.network : err.message);
  }, [router, toLogin]);

  useEffect(() => {
    // Muat sesi saat mount; setState terjadi setelah await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, toLogin);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, toLogin);
  }, [toLogin]);

  const signOut = useCallback(async () => {
    await supabaseBrowser().auth.signOut();
    toast.success(t.toast.signedOut);
    router.replace("/");
  }, [router]);

  const value = useMemo(() => (me ? { me, refresh: load, signOut } : null), [me, load, signOut]);

  if (failed) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="w-full max-w-md">
          <Alert
            tone="error"
            title={t.common.loadFailed}
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setFailed(null);
                  void load();
                }}
              >
                <Icon name="refresh" /> {t.common.retry}
              </Button>
            }
          >
            {failed}
          </Alert>
        </div>
      </div>
    );
  }
  if (!value) return <PageLoader />;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
