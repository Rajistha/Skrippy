import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export { schema };

/**
 * Tipe database yang dipakai service. Implementasinya bisa postgres-js (produksi, pooler Supabase)
 * atau PGlite (tes), keduanya memakai PgDatabase yang sama sehingga SQL (FOR UPDATE, transaksi) identik.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Service menerima Db atau Tx, sehingga bisa dipakai di dalam transaksi yang sudah berjalan. */
export type Executor = Db | Tx;
