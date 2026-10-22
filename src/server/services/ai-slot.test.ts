import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@tests/helpers/test-db";
import { acquireAiSlot } from "./ai-slot";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

describe("giliran analisis AI lintas instance", () => {
  it("hanya satu pemegang; yang lain menunggu sampai dilepas", async () => {
    let clock = 0;
    const now = () => new Date(clock);
    const sleep = async (ms: number) => {
      clock += ms;
    };
    const first = await acquireAiSlot(t.db, 10_000, { now, sleep });
    expect(first).not.toBeNull();
    // Pemegang lain tidak kebagian dalam 6 detik.
    expect(await acquireAiSlot(t.db, 6_000, { now, sleep })).toBeNull();
    await first!();
    const second = await acquireAiSlot(t.db, 6_000, { now, sleep });
    expect(second).not.toBeNull();
    await second!();
  });

  it("kunci kedaluwarsa bila pemegangnya mati, dan pelepas basi tidak mencuri kunci baru", async () => {
    let clock = 1_000_000;
    const now = () => new Date(clock);
    const sleep = async (ms: number) => {
      clock += ms;
    };
    const stale = await acquireAiSlot(t.db, 1_000, { now, sleep, leaseMs: 5_000 });
    expect(stale).not.toBeNull();
    clock += 6_000; // pemegang pertama mati: kunci lewat batas
    const fresh = await acquireAiSlot(t.db, 1_000, { now, sleep, leaseMs: 5_000 });
    expect(fresh).not.toBeNull();
    await stale!(); // melepas dengan identitas lama: tidak boleh membuka kunci milik yang baru
    expect(await acquireAiSlot(t.db, 1_000, { now, sleep, leaseMs: 5_000 })).toBeNull();
    await fresh!();
  });
});
