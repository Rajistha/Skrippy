import { eq } from "drizzle-orm";
import { getAuthUser } from "@/server/auth";
import { schema } from "@/server/db";
import { getDb } from "@/server/db/client";
import { json, parseBody, route } from "@/server/http";
import { accessOut, profileOut } from "@/server/mappers";
import { getAccessStatus, redeemCode } from "@/server/services/access";
import { redeemInSchema, type Me } from "@/lib/schemas";

export const runtime = "nodejs";

/** Boleh dipanggil tanpa profil: profil dibuat di dalam transaksi penukaran pertama. */
export const POST = route(async (request: Request) => {
  const claims = await getAuthUser();
  const body = await parseBody(request, redeemInSchema);
  const db = getDb();
  await redeemCode(db, claims, body.code);
  const [profile] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.id, claims.userId));
  const status = await getAccessStatus(db, claims.userId);
  const out: Me = { profile: profileOut(profile!), access: accessOut(status) };
  return json(out);
});
