import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, parseId, route } from "@/server/http";
import { deleteCode } from "@/server/services/access";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Hapus kode permanen; akses yang berasal dari kode ini ikut dicabut. Hanya admin. */
export const DELETE = route(async (_request: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const { usersAffected } = await deleteCode(getDb(), admin.id, parseId((await params).id));
  return json({ users_affected: usersAffected });
});
