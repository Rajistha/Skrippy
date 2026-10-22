import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { schema, type Db } from "@/server/db";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../drizzle");

export type TestDb = { db: Db; raw: PGlite; close: () => Promise<void> };

/**
 * Postgres sungguhan (PGlite) dengan migrasi produksi diterapkan pada database kosong.
 * Skema `auth` milik Supabase ditiru seperlunya (tabel users) agar FK profiles bisa berjalan.
 */
export async function createTestDb(): Promise<TestDb> {
  const raw = new PGlite();
  await raw.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz NOT NULL DEFAULT now());
  `);
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS, file), "utf-8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await raw.exec(statement);
    }
  }
  const db = drizzle(raw, { schema }) as unknown as Db;
  return { db, raw, close: () => raw.close() };
}

export async function createAuthUser(
  raw: PGlite,
  id: string,
  email = "rina@example.com",
): Promise<void> {
  await raw.query("INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
    id,
    email,
  ]);
}
