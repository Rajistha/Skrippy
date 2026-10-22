"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

let cached: Promise<string> | undefined;

/** Satu kali ambil per sesi tab, dan hanya saat benar-benar dibutuhkan (`enabled`). */
export function useOwnerWhatsapp(enabled: boolean): string {
  const [number, setNumber] = useState("");
  useEffect(() => {
    if (!enabled) return;
    cached ??= api.GET("/public/info").then(({ data }) => data?.whatsapp ?? "");
    let live = true;
    void cached.then((n) => live && setNumber(n));
    return () => {
      live = false;
    };
  }, [enabled]);
  return number;
}
