import { requireAdmin } from "@/server/auth";
import { getStorage } from "@/server/integrations/storage";
import { json, parseBody, route } from "@/server/http";
import { testGuidelineOnManuscript } from "@/server/services/guidelines";
import { guidelineTestInSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Uji aturan yang sedang disusun pada naskah contoh sebelum pedoman diterbitkan. Tidak menyimpan apa pun. */
export const POST = route(async (request: Request) => {
  await requireAdmin();
  const body = await parseBody(request, guidelineTestInSchema);
  return json(await testGuidelineOnManuscript(getStorage(), body.path, body.rules));
});
