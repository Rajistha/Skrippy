import type { Sql } from "postgres";

/**
 * Pembatas konkurensi untuk klien Postgres.
 *
 * Pooler Supabase (Supavisor, mode transaction) menggantung bila beberapa query dikirim bersamaan pada
 * satu koneksi (pipelining): query tidak pernah selesai sampai koneksi diputus puluhan detik kemudian.
 * Query berurutan lancar. postgres.js memipeline query yang melebihi jumlah koneksi, jadi di sini jumlah
 * query/transaksi yang sedang berjalan dibatasi sama dengan jumlah koneksi; sisanya mengantre (FIFO)
 * di aplikasi dan dijalankan begitu ada slot kosong.
 */
export function createGate(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  async function acquire(): Promise<void> {
    if (active < limit) {
      active++;
      return;
    }
    // Slot diserahkan langsung oleh release(), jadi `active` tidak berubah.
    await new Promise<void>((resolve) => waiting.push(resolve));
  }

  function release(): void {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
    /** Untuk uji: jumlah yang sedang berjalan dan yang mengantre. */
    stats: () => ({ active, waiting: waiting.length }),
  };
}

/**
 * Membungkus klien postgres.js agar `unsafe` (dipakai drizzle untuk setiap query) dan `begin` (transaksi)
 * melewati pembatas. Query di dalam transaksi memakai koneksi transaksi itu sendiri dan tidak dihitung ulang.
 */
export function gateClient<S extends Sql>(sql: S, limit: number): S {
  const gate = createGate(limit);
  return new Proxy(sql, {
    get(target, prop, receiver) {
      if (prop === "unsafe") {
        return (...args: unknown[]) => {
          const start = () =>
            (
              target.unsafe as (
                ...a: unknown[]
              ) => PromiseLike<unknown> & { values(): PromiseLike<unknown> }
            )(...args);
          // Drizzle memakai hasilnya sebagai thenable, atau memanggil .values() lebih dulu.
          return {
            then: (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              gate.run(async () => await start()).then(resolve, reject),
            values: () => ({
              then: (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
                gate.run(async () => await start().values()).then(resolve, reject),
            }),
          };
        };
      }
      if (prop === "begin") {
        return (...args: unknown[]) =>
          gate.run(
            async () => await (target.begin as (...a: unknown[]) => PromiseLike<unknown>)(...args),
          );
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
}
