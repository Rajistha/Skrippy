import { describe, expect, it } from "vitest";
import { createGate, gateClient } from "./gate";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("pembatas konkurensi", () => {
  it("tidak pernah menjalankan lebih dari batas, dan semua pekerjaan selesai berurutan masuk", async () => {
    const gate = createGate(2);
    let running = 0;
    let peak = 0;
    const order: number[] = [];
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        gate.run(async () => {
          running++;
          peak = Math.max(peak, running);
          order.push(i);
          await tick();
          running--;
        }),
      ),
    );
    expect(peak).toBe(2);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); // FIFO
    expect(gate.stats()).toEqual({ active: 0, waiting: 0 });
  });

  it("galat melepas slot dan diteruskan ke pemanggil", async () => {
    const gate = createGate(1);
    await expect(gate.run(async () => Promise.reject(new Error("gagal")))).rejects.toThrow("gagal");
    await expect(gate.run(async () => "lanjut")).resolves.toBe("lanjut");
    expect(gate.stats()).toEqual({ active: 0, waiting: 0 });
  });
});

describe("klien yang dibungkus", () => {
  /** Klien palsu bergaya postgres.js: unsafe() mengembalikan thenable dengan .values(). */
  function fakeSql() {
    const state = { running: 0, peak: 0, begun: 0 };
    const exec = async (rows: unknown[]) => {
      state.running++;
      state.peak = Math.max(state.peak, state.running);
      await tick();
      state.running--;
      return rows;
    };
    const client = {
      unsafe: (q: string) => ({
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          (q === "boom" ? Promise.reject(new Error("sql salah")) : exec([{ q }])).then(res, rej),
        values: () => ({ then: (res: (v: unknown) => unknown) => exec([[q]]).then(res) }),
      }),
      begin: async (fn: (tx: unknown) => Promise<unknown>) => {
        state.begun++;
        state.running++;
        state.peak = Math.max(state.peak, state.running);
        try {
          return await fn({ unsafe: () => Promise.resolve([{ dalam: "tx" }]) });
        } finally {
          state.running--;
        }
      },
      lainnya: "diteruskan",
    };
    return { client, state };
  }

  it("query dan transaksi bersamaan tidak melewati batas; hasil dan .values() tetap benar", async () => {
    const { client, state } = fakeSql();
    const sql = gateClient(client as never, 2) as unknown as typeof client;
    const results = await Promise.all([
      ...Array.from({ length: 8 }, (_, i) => Promise.resolve(sql.unsafe(`q${i}`))),
      ...Array.from({ length: 3 }, (_, i) => Promise.resolve(sql.unsafe(`v${i}`).values())),
      sql.begin(async (tx) => (tx as { unsafe: () => Promise<unknown> }).unsafe()),
      sql.begin(async () => "selesai"),
    ]);
    expect(state.peak).toBeLessThanOrEqual(2);
    expect(results[0]).toEqual([{ q: "q0" }]);
    expect(results[8]).toEqual([["v0"]]);
    expect(results[11]).toEqual([{ dalam: "tx" }]);
    expect(results[12]).toBe("selesai");
    expect(state.begun).toBe(2);
  });

  it("galat SQL diteruskan dan tidak menahan slot; properti lain diteruskan apa adanya", async () => {
    const { client } = fakeSql();
    const sql = gateClient(client as never, 1) as unknown as typeof client;
    await expect(Promise.resolve(sql.unsafe("boom"))).rejects.toThrow("sql salah");
    await expect(Promise.resolve(sql.unsafe("ok"))).resolves.toEqual([{ q: "ok" }]);
    expect(sql.lainnya).toBe("diteruskan");
  });
});
