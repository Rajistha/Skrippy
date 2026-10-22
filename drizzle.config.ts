import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  // Hanya skema public. Skema auth dan storage milik Supabase tidak boleh disentuh.
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
