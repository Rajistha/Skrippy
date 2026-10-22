"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Status masuk untuk menyesuaikan tampilan publik (null = belum diketahui). Hanya tampilan; akses data tetap diverifikasi server. */
export function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    // Dibungkus promise: klien yang gagal dibuat (env belum diisi) dianggap belum masuk, tanpa mematahkan halaman.
    void Promise.resolve()
      .then(async () => {
        const supabase = supabaseBrowser();
        const { data } = await supabase.auth.getSession();
        setSignedIn(Boolean(data.session));
        const sub = supabase.auth.onAuthStateChange((_event, session) =>
          setSignedIn(Boolean(session)),
        );
        unsubscribe = () => sub.data.subscription.unsubscribe();
      })
      .catch(() => setSignedIn(false));
    return () => unsubscribe?.();
  }, []);
  return signedIn;
}
