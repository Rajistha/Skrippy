import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, parseBody, route } from "@/server/http";
import { addDictionaryEntry, listDictionary } from "@/server/services/dictionary";
import { dictionaryInSchema, type DictionaryEntryOut } from "@/lib/schemas";

export const runtime = "nodejs";

const out = (r: Awaited<ReturnType<typeof listDictionary>>[number]): DictionaryEntryOut => ({
  id: r.id,
  kind: r.kind as DictionaryEntryOut["kind"],
  term: r.term,
  replacement: r.replacement,
});

export const GET = route(async () => {
  await requireAdmin();
  return json((await listDictionary(getDb())).map(out));
});

export const POST = route(async (request: Request) => {
  const admin = await requireAdmin();
  const body = await parseBody(request, dictionaryInSchema);
  return json(out(await addDictionaryEntry(getDb(), admin.id, body)), 201);
});
