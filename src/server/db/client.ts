import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "../env";
import { gateClient } from "./gate";
import * as schema from "./schema";
import type { Db } from "./index";

// Disimpan di globalThis agar hot reload di `next dev` tidak membuka koneksi baru (3 detik lebih)
// setiap modul dimuat ulang. Di produksi tidak berpengaruh: satu klien per instance function.
const POOL_MAX = 2;
const globalForDb = globalThis as unknown as { __skrippyDb?: Db };

/**
 * Satu klien bersama per instance function. Connection string pooler Supabase (mode transaction)
 * tidak mendukung prepared statement, jadi `prepare: false`. `max: 1` agar tidak menghabiskan pooler.
 */
export function getDb(): Db {
  if (!globalForDb.__skrippyDb) {
    // max 2: pooler Supabase (Supavisor) menyediakan sangat sedikit koneksi backend untuk satu proyek, dan setiap
    // proses (server dev, instance function) membuka koneksinya sendiri. Dicoba langsung: koneksi ke-3 dalam
    // satu proses gagal dengan "statement timeout", dan beberapa query paralel menggantung puluhan detik.
    // Dua koneksi cukup untuk paralelisme ringan (profil + akses); query lain mengantre di klien, bukan gagal.
    // idle_timeout melepas koneksi ke pooler saat sepi; connect_timeout pendek agar gagal cepat dan jelas.
    const sql = postgres(getEnv().DATABASE_URL, {
      prepare: false,
      max: POOL_MAX,
      idle_timeout: 10,
      max_lifetime: 60 * 30,
      connect_timeout: 10,
    });
    // Pembatas konkurensi: pooler menggantung bila query dipipeline pada satu koneksi (lihat gate.ts).
    globalForDb.__skrippyDb = drizzle(gateClient(sql, POOL_MAX), { schema }) as unknown as Db;
  }
  return globalForDb.__skrippyDb;
}
