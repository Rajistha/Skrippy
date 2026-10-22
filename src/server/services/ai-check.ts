import "server-only";
import {
  ABSTRACT_SYSTEM,
  abstractUser,
  ALIGNMENT_SYSTEM,
  alignmentUser,
  BIBLIOGRAPHY_SYSTEM,
  batchParagraphs,
  bibliographyUser,
  CONSISTENCY_SYSTEM,
  consistencyUser,
  extractAbstract,
  extractBibliographyEntries,
  extractAlignmentContext,
  extractConsistencyContext,
  GRAMMAR_SYSTEM,
  grammarUser,
  parseAbstractResponse,
  parseBibliographyResponse,
  parseAlignmentResponse,
  parseConsistencyResponse,
  parseGrammarResponse,
  selectParagraphs,
} from "../checkers/ai/prompts";
import type { Issue, ParsedDocument } from "../checkers/types";
import { AI_ERROR_NOTE, AiError, type AiClient, type AiErrorCode } from "../integrations/ai";

export type AiRunResult = {
  issues: Issue[];
  /** completed: semua bagian terperiksa. partial: sebagian saja. failed: tidak ada yang berhasil. */
  status: "completed" | "partial" | "failed";
  note: string | null;
};

const clipNote = (s: string): string => (s.length > 160 ? `${s.slice(0, 159)}…` : s);

/** Satu panggilan sekali jalan per analisis, supaya batas kecepatan penyedia (terutama tingkat gratis) tidak terlewati. */
const CONCURRENCY = 1;

/**
 * Antrean analisis AI: hanya satu analisis berjalan sekaligus di proses ini, analisis lain menunggu giliran.
 * Batasnya per proses server; bila Vercel menjalankan beberapa instance, tiap instance punya antreannya sendiri.
 */
let aiQueueTail: Promise<unknown> = Promise.resolve();
export function inAiQueue<T>(work: () => Promise<T>): Promise<T> {
  const run = aiQueueTail.then(work, work);
  aiQueueTail = run.catch(() => undefined);
  return run;
}
/** Sisakan waktu dalam batas 300 detik function untuk menyimpan hasil. */
const DEFAULT_BUDGET_MS = 200_000;

/**
 * Jalankan analisis AI atas dokumen. Kegagalan AI tidak pernah melempar: hasilnya dilaporkan lewat `status`
 * sehingga cek aturan tetap selesai. Tidak ada isi naskah yang di-log.
 */
/** Antre lintas instance: mengembalikan pelepas giliran, atau null bila tidak kebagian dalam waktu itu. */
export type SlotAcquirer = (waitMs: number) => Promise<(() => Promise<void>) | null>;

const QUEUE_TIMEOUT_NOTE =
  "Waktu habis saat menunggu giliran analisis AI. Coba jalankan lagi nanti.";

export function runAiChecks(
  doc: ParsedDocument,
  client: AiClient,
  opts: { maxChars: number; budgetMs?: number; now?: () => number; slot?: SlotAcquirer },
): Promise<AiRunResult> {
  const now = opts.now ?? Date.now;
  const enqueued = now();
  const total = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  // Waktu menunggu giliran ikut dihitung: function Vercel punya batas total 300 detik.
  return inAiQueue(async () => {
    const left = (): number => total - (now() - enqueued);
    const release = opts.slot ? await opts.slot(Math.max(0, left())) : async () => undefined;
    if (!release) return { issues: [], status: "failed", note: QUEUE_TIMEOUT_NOTE };
    try {
      return await analyze(doc, client, opts, left());
    } finally {
      await release().catch(() => undefined);
    }
  });
}

async function analyze(
  doc: ParsedDocument,
  client: AiClient,
  opts: { maxChars: number; now?: () => number },
  budgetMs: number,
): Promise<AiRunResult> {
  const now = opts.now ?? Date.now;
  const deadline = now() + budgetMs;
  const { paragraphs, truncated } = selectParagraphs(doc, opts.maxChars);
  const batches = batchParagraphs(paragraphs);
  const consistency = extractConsistencyContext(doc);

  type Job = () => Promise<Issue[]>;
  const jobs: Job[] = batches.map(
    (batch) => async () =>
      parseGrammarResponse(
        await client.complete({
          system: GRAMMAR_SYSTEM,
          user: grammarUser(batch),
          maxTokens: 3000,
        }),
        batch,
      ),
  );
  if (consistency) {
    jobs.push(async () =>
      parseConsistencyResponse(
        await client.complete({
          system: CONSISTENCY_SYSTEM,
          user: consistencyUser(consistency),
          maxTokens: 2000,
        }),
        consistency,
      ),
    );
  }
  const abstract = extractAbstract(doc);
  if (abstract) {
    jobs.push(async () =>
      parseAbstractResponse(
        await client.complete({
          system: ABSTRACT_SYSTEM,
          user: abstractUser(abstract),
          maxTokens: 1500,
        }),
        abstract,
      ),
    );
  }
  const alignment = extractAlignmentContext(doc);
  if (alignment) {
    jobs.push(async () =>
      parseAlignmentResponse(
        await client.complete({
          system: ALIGNMENT_SYSTEM,
          user: alignmentUser(alignment),
          maxTokens: 2000,
        }),
        alignment,
      ),
    );
  }
  const bibliography = extractBibliographyEntries(doc);
  if (bibliography) {
    jobs.push(async () =>
      parseBibliographyResponse(
        await client.complete({
          system: BIBLIOGRAPHY_SYSTEM,
          user: bibliographyUser(bibliography),
          maxTokens: 2500,
        }),
        bibliography,
      ),
    );
  }
  if (jobs.length === 0)
    return {
      issues: [],
      status: "completed",
      note: "Tidak ada paragraf isi yang bisa dianalisis AI.",
    };

  const issues: Issue[] = [];
  let done = 0;
  let failed = 0;
  let skipped = 0;
  let lastError: AiErrorCode = "unavailable";
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      if (now() > deadline) {
        skipped++;
        continue;
      }
      try {
        issues.push(...(await job()));
        done++;
      } catch (e) {
        failed++;
        lastError = e instanceof AiError ? e.code : "unavailable";
        // Kunci salah: sisa pekerjaan pasti gagal juga, hentikan agar tidak membuang waktu.
        if (lastError === "invalid_key") next = jobs.length;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

  if (done === 0)
    return {
      issues: [],
      status: "failed",
      note: failed === 0 && skipped > 0 ? QUEUE_TIMEOUT_NOTE : AI_ERROR_NOTE[lastError],
    };
  const notes: string[] = [];
  if (failed + skipped > 0 || next < jobs.length) {
    const reasons: string[] = [];
    if (failed > 0) reasons.push(`${failed} bagian gagal: ${AI_ERROR_NOTE[lastError]}`);
    if (skipped > 0) reasons.push(`${skipped} bagian dilewati karena waktu analisis habis`);
    notes.push(`Sebagian bagian naskah belum sempat dianalisis AI. ${reasons.join("; ")}.`.trim());
  }
  if (truncated) notes.push("Naskah sangat panjang, hanya bagian awal yang dianalisis AI.");
  return {
    issues,
    status: notes.length > 0 ? "partial" : "completed",
    // Kolom ai_note maksimal 160 karakter.
    note: notes.length > 0 ? clipNote(notes.join(" ")) : null,
  };
}
