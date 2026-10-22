import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "../db";
import { schema } from "../db";

const { aiSlots } = schema;
const KEY = "analysis";
const POLL_MS = 2000;

export type SlotOptions = {
  /** Lama kunci berlaku bila pemegangnya mati sebelum melepas. */
  leaseMs?: number;
  pollMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Antre untuk satu-satunya giliran analisis AI, lintas instance server. Mengembalikan fungsi pelepas,
 * atau null bila giliran tidak didapat dalam `waitMs`. Tanpa transaksi panjang: kunci hanya satu baris
 * dengan batas waktu, dan menunggu dilakukan dengan menanyakan ulang secara berkala.
 */
export async function acquireAiSlot(
  db: Db,
  waitMs: number,
  opts: SlotOptions = {},
): Promise<(() => Promise<void>) | null> {
  const now = opts.now ?? (() => new Date());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const leaseMs = opts.leaseMs ?? 240_000;
  const holder = randomUUID();
  const started = now().getTime();
  for (;;) {
    const t = now();
    const taken = await db
      .insert(aiSlots)
      .values({ key: KEY, holder, lockedUntil: new Date(t.getTime() + leaseMs) })
      .onConflictDoUpdate({
        target: aiSlots.key,
        set: { holder, lockedUntil: new Date(t.getTime() + leaseMs) },
        setWhere: lt(aiSlots.lockedUntil, t),
      })
      .returning({ holder: aiSlots.holder });
    if (taken.length > 0 && taken[0]!.holder === holder) {
      return async () => {
        await db
          .update(aiSlots)
          .set({ lockedUntil: new Date(0) })
          .where(and(eq(aiSlots.key, KEY), eq(aiSlots.holder, holder)));
      };
    }
    if (now().getTime() - started >= waitMs) return null;
    await sleep(opts.pollMs ?? POLL_MS);
  }
}
