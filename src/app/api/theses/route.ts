import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, parseBody, route } from "@/server/http";
import { thesisOut } from "@/server/mappers";
import { createThesis, listTheses } from "@/server/services/theses";
import { thesisInSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export const GET = route(async () => {
  const user = await requireProfile();
  return json((await listTheses(getDb(), user)).map(thesisOut));
});

export const POST = route(async (request: Request) => {
  const user = await requireProfile();
  const body = await parseBody(request, thesisInSchema);
  const thesis = await createThesis(getDb(), user, {
    title: body.title,
    guidelineId: body.guideline_id,
  });
  return json(thesisOut(thesis), 201);
});
