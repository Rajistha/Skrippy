import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthUser, createTestDb, type TestDb } from "@tests/helpers/test-db";
import { schema } from "../db";
import type { EmailClient, EmailMessage } from "../integrations/email";
import { ResendClient } from "../integrations/email";
import * as access from "./access";
import { sendExpiryReminders } from "./maintenance";

const NOW = new Date("2026-10-20T03:00:00Z");
const DAY = 86_400_000;
const BASE = "https://skrippy.id";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

class FakeEmail implements EmailClient {
  sent: EmailMessage[] = [];
  failFor = new Set<string>();
  async send(m: EmailMessage): Promise<void> {
    if (this.failFor.has(m.to)) throw new Error("smtp down");
    this.sent.push(m);
  }
}

async function userWithGrants(
  grants: Array<{ kind: "trial" | "package"; endsInDays: number; revoked?: boolean }>,
) {
  const id = randomUUID();
  const email = `${id.slice(0, 6)}@example.com`;
  await createAuthUser(t.raw, id, email);
  await t.db.insert(schema.profiles).values({ id, email, fullName: "Rina Putri", trialUsed: true });
  for (const g of grants) {
    await t.db.insert(schema.accessGrants).values({
      userId: id,
      kind: g.kind,
      startsAt: new Date(NOW.getTime() - 5 * DAY),
      endsAt: new Date(NOW.getTime() + g.endsInDays * DAY),
      checkLimit: null,
      dailyCheckLimit: 20,
      revokedAt: g.revoked ? NOW : null,
    });
  }
  return { id, email };
}

const reminderFlag = async (userId: string) =>
  (await t.db.select().from(schema.accessGrants).where(eq(schema.accessGrants.userId, userId)))[0]!
    .reminderSentAt;

describe("pengingat akses hampir habis", () => {
  it("mengirim sekali untuk akses yang berakhir dalam 3 hari, lalu tidak lagi", async () => {
    const u = await userWithGrants([{ kind: "trial", endsInDays: 2 }]);
    const email = new FakeEmail();
    const first = await sendExpiryReminders(t.db, email, BASE, NOW);
    expect(first.sent).toBeGreaterThanOrEqual(1);
    const mine = email.sent.filter((m) => m.to === u.email);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.subject).toContain("22 Oktober 2026");
    expect(mine[0]!.text).toContain("Halo Rina,");
    expect(mine[0]!.text).toContain(`${BASE}/profil`);
    expect(await reminderFlag(u.id)).not.toBeNull();
    await sendExpiryReminders(t.db, email, BASE, NOW);
    expect(email.sent.filter((m) => m.to === u.email)).toHaveLength(1);
  });

  it("tidak mengirim untuk akses yang masih lama, sudah lewat, atau dicabut", async () => {
    const far = await userWithGrants([{ kind: "package", endsInDays: 20 }]);
    const past = await userWithGrants([{ kind: "trial", endsInDays: -1 }]);
    const revoked = await userWithGrants([{ kind: "trial", endsInDays: 2, revoked: true }]);
    const email = new FakeEmail();
    await sendExpiryReminders(t.db, email, BASE, NOW);
    const recipients = email.sent.map((m) => m.to);
    for (const u of [far, past, revoked]) expect(recipients).not.toContain(u.email);
  });

  it("pengguna dengan akses lain yang lebih lama tidak diingatkan", async () => {
    const u = await userWithGrants([
      { kind: "trial", endsInDays: 2 },
      { kind: "package", endsInDays: 25 },
    ]);
    const email = new FakeEmail();
    await sendExpiryReminders(t.db, email, BASE, NOW);
    expect(email.sent.map((m) => m.to)).not.toContain(u.email);
  });

  it("tanpa klien email: dilewati dan dilaporkan, tidak ditandai terkirim", async () => {
    const u = await userWithGrants([{ kind: "trial", endsInDays: 1 }]);
    const res = await sendExpiryReminders(t.db, null, BASE, NOW);
    expect(res.skipped).toBeGreaterThanOrEqual(1);
    expect(res.sent).toBe(0);
    expect(await reminderFlag(u.id)).toBeNull();
  });

  it("gagal kirim tidak ditandai terkirim sehingga dicoba lagi", async () => {
    const u = await userWithGrants([{ kind: "trial", endsInDays: 1 }]);
    const email = new FakeEmail();
    email.failFor.add(u.email);
    await sendExpiryReminders(t.db, email, BASE, NOW);
    expect(await reminderFlag(u.id)).toBeNull();
    email.failFor.clear();
    await sendExpiryReminders(t.db, email, BASE, NOW);
    expect(email.sent.map((m) => m.to)).toContain(u.email);
    expect(await reminderFlag(u.id)).not.toBeNull();
  });

  it("akun pemilik dengan akses puluhan tahun tidak pernah diingatkan", async () => {
    const adminId = randomUUID();
    await createAuthUser(t.raw, adminId, "pemilik@example.com");
    await t.db
      .insert(schema.profiles)
      .values({ id: adminId, email: "pemilik@example.com", role: "superadmin", trialUsed: true });
    await t.db.insert(schema.accessGrants).values({
      userId: adminId,
      kind: "package",
      startsAt: NOW,
      endsAt: new Date(NOW.getTime() + 365 * 50 * DAY),
      checkLimit: null,
      dailyCheckLimit: 1000,
    });
    const email = new FakeEmail();
    await sendExpiryReminders(t.db, email, BASE, NOW);
    expect(email.sent.map((m) => m.to)).not.toContain("pemilik@example.com");
    expect(access).toBeDefined();
  });
});

describe("klien Resend", () => {
  it("mengirim ke API dengan header dan isi yang benar, dan melempar bila gagal", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const ok = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await new ResendClient("re_key", "Skrippy <halo@skrippy.id>", ok).send({
      to: "a@b.id",
      subject: "S",
      text: "T",
    });
    expect(seen!.url).toBe("https://api.resend.com/emails");
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe("Bearer re_key");
    expect(JSON.parse(seen!.init.body as string)).toEqual({
      from: "Skrippy <halo@skrippy.id>",
      to: ["a@b.id"],
      subject: "S",
      text: "T",
    });
    const bad = (async () => new Response("no", { status: 422 })) as unknown as typeof fetch;
    await expect(
      new ResendClient("k", "f", bad).send({ to: "a@b.id", subject: "S", text: "T" }),
    ).rejects.toThrow(/422/);
  });
});
