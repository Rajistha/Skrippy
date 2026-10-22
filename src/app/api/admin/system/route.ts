import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, route } from "@/server/http";
import { getStorage } from "@/server/integrations/storage";
import { systemStatus } from "@/server/services/system";
import type { SystemStatus } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = route(async () => {
  await requireAdmin();
  const s = await systemStatus(getDb(), getStorage());
  const body: SystemStatus = {
    checked_at: s.checkedAt.toISOString(),
    app: {
      environment: s.app.environment,
      region: s.app.region,
      commit: s.app.commit,
      node: s.app.node,
      uptime_seconds: s.app.uptimeSeconds,
      storage_provider: s.app.storageProvider,
    },
    supabase: {
      status: s.supabase.status,
      latency_ms: s.supabase.latencyMs,
      database: s.supabase.database && {
        used_bytes: s.supabase.database.usedBytes,
        limit_bytes: s.supabase.database.limitBytes,
      },
      connections: s.supabase.connections,
      auth_users: s.supabase.authUsers,
      tables: s.supabase.tables,
      storage: s.supabase.storage && {
        objects: s.supabase.storage.objects,
        used_bytes: s.supabase.storage.usedBytes,
      },
    },
    vercel: {
      status: s.vercel.status,
      api_connected: s.vercel.apiConnected,
      deployments: s.vercel.deployments.map((d) => ({
        id: d.id,
        state: d.state,
        target: d.target,
        created_at: d.createdAt.toISOString(),
        message: d.message,
        commit: d.commit,
      })),
    },
    cloudflare: {
      status: s.cloudflare.status,
      active: s.cloudflare.active,
      latency_ms: s.cloudflare.latencyMs,
      bucket: s.cloudflare.bucket,
      files: s.cloudflare.files,
      storage: {
        used_bytes: s.cloudflare.storage.usedBytes,
        limit_bytes: s.cloudflare.storage.limitBytes,
      },
    },
  };
  const res = json(body);
  res.headers.set("Cache-Control", "no-store");
  return res;
});
