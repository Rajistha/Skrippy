import { requireProfile } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { json, route } from "@/server/http";
import { documentOut, runOut, thesisOut } from "@/server/mappers";
import { recentRuns } from "@/server/services/checks";
import { listDocuments, listTheses } from "@/server/services/theses";
import type { Dashboard } from "@/lib/schemas";

export const runtime = "nodejs";

/**
 * Semua data beranda dalam satu permintaan. Sebelumnya tiga permintaan berurutan
 * (skripsi, detail, cek), masing-masing membayar verifikasi sesi dan waktu tempuh database.
 */
export const GET = route(async () => {
  const user = await requireProfile();
  const db = getDb();
  const [theses, runs] = await Promise.all([listTheses(db, user), recentRuns(db, user)]);
  const first = theses[0];
  const documents = first ? await listDocuments(db, first) : [];
  const body: Dashboard = {
    thesis: first ? thesisOut(first) : null,
    documents: documents.map(documentOut),
    runs: runs.map(runOut),
  };
  return json(body);
});
