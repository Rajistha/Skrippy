import { requireAdmin } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { AI_ERROR_NOTE, AiError } from "@/server/integrations/ai";
import { json, route } from "@/server/http";
import { getAiClient } from "@/server/services/ai-config";

export const runtime = "nodejs";

/** Uji sambungan dengan satu permintaan kecil. Tidak mengirim isi naskah. */
export const POST = route(async () => {
  await requireAdmin();
  const client = await getAiClient(getDb(), { ignoreEnabled: true });
  if (!client) return json({ ok: false, message: "Kunci API belum disimpan." });
  try {
    await client.complete({
      system: "Jawab singkat.",
      user: "Balas dengan kata: siap",
      maxTokens: 10,
    });
    return json({ ok: true, message: "Tersambung. Kunci API diterima penyedia." });
  } catch (e) {
    const known = e instanceof AiError;
    const note = AI_ERROR_NOTE[known ? e.code : "unavailable"];
    return json({ ok: false, message: known && e.detail ? `${note} (${e.detail})` : note });
  }
});
