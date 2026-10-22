import "server-only";
import { count, sql, sum } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";
import { getEnv } from "../env";
import type { StorageClient } from "../integrations/storage";

const { documents } = schema;

/** Batas paket gratis, dipakai hanya untuk menampilkan sisa kuota. */
const SUPABASE_DB_LIMIT_BYTES = 500 * 1024 * 1024;
const R2_FREE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;
const EXTERNAL_TIMEOUT_MS = 5000;

type ServiceStatus = "ok" | "error" | "not_configured";

export type SystemStatus = {
  checkedAt: Date;
  app: {
    environment: string;
    region: string | null;
    commit: string | null;
    node: string;
    uptimeSeconds: number;
    storageProvider: "supabase" | "r2";
  };
  supabase: {
    status: ServiceStatus;
    latencyMs: number | null;
    database: { usedBytes: number; limitBytes: number } | null;
    connections: number | null;
    authUsers: number | null;
    tables: Array<{ name: string; bytes: number; rows: number }>;
    storage: { objects: number; usedBytes: number } | null;
  };
  vercel: {
    status: ServiceStatus;
    apiConnected: boolean;
    deployments: Array<{
      id: string;
      state: string;
      target: string | null;
      createdAt: Date;
      message: string | null;
      commit: string | null;
    }>;
  };
  cloudflare: {
    status: ServiceStatus;
    active: boolean;
    latencyMs: number | null;
    bucket: string | null;
    files: number;
    storage: { usedBytes: number; limitBytes: number };
  };
};

/** postgres-js mengembalikan array, PGlite mengembalikan { rows }. */
function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  return ((res as { rows?: T[] } | null)?.rows ?? []) as T[];
}

async function query<T>(db: Db, q: ReturnType<typeof sql>): Promise<T[]> {
  return rowsOf<T>(await db.execute(q));
}

/** Gagal di satu bagian tidak boleh merusak halaman: hasilnya `fallback`. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function timed(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await fn();
  return Math.round(performance.now() - start);
}

async function supabaseStatus(
  db: Db,
  provider: "supabase" | "r2",
  bucket: string,
): Promise<SystemStatus["supabase"]> {
  const empty: SystemStatus["supabase"] = {
    status: "error",
    latencyMs: null,
    database: null,
    connections: null,
    authUsers: null,
    tables: [],
    storage: null,
  };
  let latencyMs: number;
  try {
    latencyMs = await timed(() => db.execute(sql`select 1`));
  } catch {
    return empty;
  }

  const [size] = await safe(
    () =>
      query<{ size: string | number }>(
        db,
        sql`select pg_database_size(current_database()) as size`,
      ),
    [],
  );
  const [conn] = await safe(
    () =>
      query<{ n: string | number }>(
        db,
        sql`select count(*)::int as n from pg_stat_activity where datname = current_database()`,
      ),
    [],
  );
  const tables = await safe(
    () =>
      query<{ name: string; bytes: string | number; rows: string | number }>(
        db,
        sql`select c.relname as name, pg_total_relation_size(c.oid)::bigint as bytes, greatest(c.reltuples, 0)::bigint as rows
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'
            order by bytes desc limit 8`,
      ),
    [],
  );
  const [authUsers] = await safe(
    () => query<{ n: string | number }>(db, sql`select count(*)::int as n from auth.users`),
    [],
  );
  const [objects] =
    provider === "supabase"
      ? await safe(
          () =>
            query<{ n: string | number; bytes: string | number }>(
              db,
              sql`select count(*)::int as n, coalesce(sum((metadata->>'size')::bigint), 0) as bytes
                  from storage.objects where bucket_id = ${bucket}`,
            ),
          [],
        )
      : [];

  return {
    status: "ok",
    latencyMs,
    database: size ? { usedBytes: Number(size.size), limitBytes: SUPABASE_DB_LIMIT_BYTES } : null,
    connections: conn ? Number(conn.n) : null,
    authUsers: authUsers ? Number(authUsers.n) : null,
    tables: tables.map((t) => ({ name: t.name, bytes: Number(t.bytes), rows: Number(t.rows) })),
    storage: objects ? { objects: Number(objects.n), usedBytes: Number(objects.bytes) } : null,
  };
}

type VercelDeployment = {
  uid?: string;
  url?: string;
  state?: string;
  readyState?: string;
  target?: string | null;
  created?: number;
  createdAt?: number;
  meta?: { githubCommitMessage?: string; githubCommitSha?: string };
};

async function vercelStatus(): Promise<SystemStatus["vercel"]> {
  const env = getEnv();
  if (!env.VERCEL_API_TOKEN || !env.VERCEL_PROJECT_ID) {
    return { status: "not_configured", apiConnected: false, deployments: [] };
  }
  const url = new URL("https://api.vercel.com/v6/deployments");
  url.searchParams.set("projectId", env.VERCEL_PROJECT_ID);
  url.searchParams.set("limit", "6");
  if (env.VERCEL_TEAM_ID) url.searchParams.set("teamId", env.VERCEL_TEAM_ID);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.VERCEL_API_TOKEN}` },
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { status: "error", apiConnected: false, deployments: [] };
    const body = (await res.json()) as { deployments?: VercelDeployment[] };
    return {
      status: "ok",
      apiConnected: true,
      deployments: (body.deployments ?? []).map((d) => ({
        id: d.uid ?? "",
        state: d.state ?? d.readyState ?? "UNKNOWN",
        target: d.target ?? null,
        createdAt: new Date(d.createdAt ?? d.created ?? 0),
        message: d.meta?.githubCommitMessage?.slice(0, 120) ?? null,
        commit: d.meta?.githubCommitSha?.slice(0, 7) ?? null,
      })),
    };
  } catch {
    return { status: "error", apiConnected: false, deployments: [] };
  }
}

async function cloudflareStatus(
  db: Db,
  storage: StorageClient,
  active: boolean,
): Promise<SystemStatus["cloudflare"]> {
  const [usage] = await safe(
    () => db.select({ n: count(), bytes: sum(documents.sizeBytes) }).from(documents),
    [],
  );
  const base = {
    active,
    bucket: active ? (storage.bucketName ?? null) : null,
    files: usage?.n ?? 0,
    storage: { usedBytes: Number(usage?.bytes ?? 0), limitBytes: R2_FREE_LIMIT_BYTES },
  };
  if (!active || !storage.ping) return { ...base, status: "not_configured", latencyMs: null };
  try {
    return { ...base, status: "ok", latencyMs: await timed(() => storage.ping!()) };
  } catch {
    return { ...base, status: "error", latencyMs: null };
  }
}

/** Kesehatan dan pemakaian layanan pihak ketiga. Tidak memuat rahasia dan tidak menyentuh isi naskah. */
export async function systemStatus(db: Db, storage: StorageClient): Promise<SystemStatus> {
  const env = getEnv();
  const provider = env.STORAGE_PROVIDER;
  // Pool database hanya 2 koneksi: bagian database dijalankan berurutan, layanan luar berjalan paralel.
  const [vercel, cloudflareProbe] = await Promise.all([
    vercelStatus(),
    safe(() => cloudflareStatus(db, storage, provider === "r2"), null),
  ]);
  const supabase = await supabaseStatus(db, provider, env.SUPABASE_STORAGE_BUCKET);
  return {
    checkedAt: new Date(),
    app: {
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      region: process.env.VERCEL_REGION ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      storageProvider: provider,
    },
    supabase,
    vercel,
    cloudflare: cloudflareProbe ?? {
      status: "error",
      active: provider === "r2",
      latencyMs: null,
      bucket: null,
      files: 0,
      storage: { usedBytes: 0, limitBytes: R2_FREE_LIMIT_BYTES },
    },
  };
}
