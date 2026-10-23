import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, route } from "@/server/http";
import { accessOut } from "@/server/mappers";
import { listUsers } from "@/server/services/admin";
import type { AdminUser } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireAdmin();
  const rows = await listUsers(getDb());
  const body: AdminUser[] = rows.map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.fullName,
    role: u.role as AdminUser["role"],
    is_owner: u.isOwner,
    created_at: u.createdAt.toISOString(),
    thesis_title: u.thesisTitle,
    access: accessOut(u.access),
    checks_used: u.checksUsed,
    storage_bytes: u.storageBytes,
    file_count: u.fileCount,
  }));
  return json(body);
});
