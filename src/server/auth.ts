import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { schema } from "./db";
import { AccessDenied, Unauthenticated } from "./errors";
import * as access from "./services/access";
import { shouldCheckTrial } from "./trial-throttle";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Identitas dari `supabase.auth.getUser()`, BUKAN `getSession()`: getUser memverifikasi token ke
 * server Auth. Klaim di cookie tidak dipercaya begitu saja.
 */
export async function getAuthUser(): Promise<access.TokenClaims> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) throw new Unauthenticated();
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  return {
    userId: data.user.id,
    email: data.user.email,
    fullName: str(meta.full_name) ?? str(meta.name),
    avatarUrl: str(meta.avatar_url) ?? str(meta.picture),
  };
}

/** Profil untuk identitas yang sudah terverifikasi. Pengguna baru otomatis dibuatkan profil dan trial. */
export async function profileFor(claims: access.TokenClaims): Promise<access.Profile> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.id, claims.userId));
  const profile = existing ?? (await access.ensureUserProfile(db, claims));
  // Trial dinyalakan setelah akun dibuat: pengguna tanpa akses mendapat trial saat masuk berikutnya.
  if (existing && !existing.trialUsed && existing.role === "user" && shouldCheckTrial(existing.id))
    await access.grantTrialIfEligible(db, existing.id);
  if (profile.deactivatedAt) throw new AccessDenied("Akun ini dinonaktifkan.");
  return profile;
}

export async function requireProfile(): Promise<access.Profile> {
  return profileFor(await getAuthUser());
}

/** Untuk semua /api/admin/*. Dicek di server, bukan hanya disembunyikan di UI. */
export async function requireAdmin(): Promise<access.Profile> {
  const profile = await requireProfile();
  if (profile.role !== "superadmin") throw new AccessDenied("Hanya untuk pemilik aplikasi.");
  return profile;
}
