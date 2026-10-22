import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, parseBody, parseId, route } from "@/server/http";
import { setUserRole } from "@/server/services/admin";
import { roleInSchema } from "@/lib/schemas";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Jadikan pengguna admin atau kembalikan ke pengguna biasa. Hanya admin; pemilik dan akun sendiri tidak bisa diubah. */
export const POST = route(async (request: Request, { params }: Ctx) => {
  const admin = await requireAdmin();
  const body = await parseBody(request, roleInSchema);
  const updated = await setUserRole(getDb(), admin.id, parseId((await params).id), body.role);
  return json({ role: updated.role as "user" | "superadmin" });
});
