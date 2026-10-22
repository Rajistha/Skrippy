import { getAuthUser, profileFor, requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { getAuthAdmin } from "@/server/integrations/auth-admin";
import { getStorage } from "@/server/integrations/storage";
import { json, noContent, route } from "@/server/http";
import { accessOut, profileOut } from "@/server/mappers";
import { getAccessStatus } from "@/server/services/access";
import { deleteAccountData } from "@/server/services/theses";
import type { Me } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = route(async () => {
  const claims = await getAuthUser();
  // Profil dan status akses tidak saling bergantung: jalankan bersamaan, bukan berurutan.
  const [profile, initial] = await Promise.all([
    profileFor(claims),
    getAccessStatus(getDb(), claims.userId),
  ]);
  // Pengguna baru: trial dibuat bersama profil, jadi status yang dibaca bersamaan tadi masih kosong.
  const status = initial.state === "none" ? await getAccessStatus(getDb(), profile.id) : initial;
  const body: Me = { profile: profileOut(profile), access: accessOut(status) };
  return json(body);
});

/** Hapus akun beserta seluruh naskah dan data pribadi. */
export const DELETE = route(async () => {
  const profile = await requireProfile();
  await getAuthUser(); // pastikan sesi masih valid sebelum tindakan permanen
  await deleteAccountData(getDb(), profile, getStorage());
  await getAuthAdmin().deleteUser(profile.id);
  return noContent();
});
