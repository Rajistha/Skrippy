import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeStorage } from "@tests/helpers/fakes";
import { createAuthUser, createTestDb, type TestDb } from "@tests/helpers/test-db";
import { schema } from "../db";
import * as admin from "./admin";
import { systemStatus } from "./system";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

describe("status sistem", () => {
  it("database terjangkau: status ok dengan latensi, dan bagian opsional tidak merusak hasil", async () => {
    const s = await systemStatus(t.db, new FakeStorage());
    expect(s.supabase.status).toBe("ok");
    expect(s.supabase.latencyMs).toBeGreaterThanOrEqual(0);
    // Tanpa token Vercel, riwayat deploy tidak dicoba dan tidak dianggap error.
    expect(s.vercel.status).toBe("not_configured");
    expect(s.vercel.deployments).toEqual([]);
    // Penyimpanan bawaan Supabase: R2 tidak aktif.
    expect(s.cloudflare.active).toBe(false);
    expect(s.cloudflare.status).toBe("not_configured");
    expect(s.cloudflare.storage.limitBytes).toBeGreaterThan(0);
    expect(s.app.node).toMatch(/^v\d+/);
  });
});

describe("ringkasan admin untuk grafik", () => {
  it("14 hari penuh, hari kosong bernilai 0, pengguna baru dan cek dihitung per hari WIB", async () => {
    const now = new Date("2026-10-20T03:00:00Z");
    const id = randomUUID();
    await createAuthUser(t.raw, id, "grafik@example.com");
    await t.db.insert(schema.profiles).values({
      id,
      email: "grafik@example.com",
      role: "user",
      trialUsed: true,
      createdAt: new Date("2026-10-19T05:00:00Z"),
    });
    const s = await admin.summary(t.db, now);
    expect(s.daily).toHaveLength(14);
    expect(s.daily[13]!.date).toBe("2026-10-20");
    expect(s.daily[0]!.date).toBe("2026-10-07");
    expect(s.daily.find((d) => d.date === "2026-10-19")!.newUsers).toBe(1);
    expect(s.daily.find((d) => d.date === "2026-10-10")).toEqual({
      date: "2026-10-10",
      checks: 0,
      failed: 0,
      newUsers: 0,
    });
    expect(s.totalUsers).toBeGreaterThanOrEqual(1);
    expect(s.checkStatus30d).toEqual({ completed: 0, failed: 0, other: 0 });
    expect(s.avgScore30d).toBeNull();
  });
});
