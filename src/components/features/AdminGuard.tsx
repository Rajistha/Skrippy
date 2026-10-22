"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useSession } from "@/lib/session";

/** Penjaga UI saja. Pemeriksaan sebenarnya ada di server (/admin/* hanya untuk superadmin). */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const router = useRouter();
  const isAdmin = me.profile.role === "superadmin";
  useEffect(() => {
    if (!isAdmin) router.replace("/dashboard");
  }, [isAdmin, router]);
  return isAdmin ? <>{children}</> : null;
}
