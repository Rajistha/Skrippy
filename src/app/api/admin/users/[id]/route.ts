import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { noContent, parseId, route } from "@/server/http";
import { getAuthAdmin } from "@/server/integrations/auth-admin";
import { getStorage } from "@/server/integrations/storage";
import { deleteUserAccount } from "@/server/services/admin";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

/** Hapus akun pengguna beserta semua datanya. Permanen. Hanya admin; akun sendiri, pemilik, dan admin tidak bisa dihapus. */
export const DELETE = route(async (_request: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  await deleteUserAccount(
    getDb(),
    { storage: getStorage(), authAdmin: getAuthAdmin() },
    admin.id,
    parseId((await params).id),
  );
  return noContent();
});
