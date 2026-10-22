/**
 * Orkestrasi pemeriksaan. Checker murni; I/O (database, storage) hanya di sini.
 * Jangan pernah me-log isi naskah: log hanya ID, jumlah, durasi, dan kode error.
 */
import "server-only";
import { and, asc, count, desc, eq, gte, lt, ne, or, isNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { parseDocx } from "../checkers/parse/document";
import { compareIssues } from "../checkers/compare";
import { runChecks } from "../checkers/registry";
import { resolveRules } from "../checkers/rules";
import { acquireAiSlot } from "./ai-slot";
import { dictionarySnapshot, ignoreEntries } from "./dictionary";
import { computeScores } from "../checkers/scoring";
import { applyIgnores } from "../checkers/ignore";
import { computeStats } from "../checkers/stats";
import {
  CATEGORIES,
  type Category,
  type Issue,
  type IssueCategory,
  type ParsedDocument,
  type Rules,
} from "../checkers/types";
import type { Db, Executor } from "../db";
import { schema } from "../db";
import { AppError, CheckNotAllowed, NotFound, RateLimited } from "../errors";
import type { AiClient } from "../integrations/ai";
import type { Comparison, ScoreTrendPoint } from "@/lib/schemas";
import type { StorageClient } from "../integrations/storage";
import { reportPdfKey } from "../reports/cache-key";
import * as access from "./access";
import { issueOut } from "../mappers";
import { runAiChecks } from "./ai-check";
import { getAiStatus } from "./ai-config";
import type { DocumentRow, Thesis } from "./theses";

const { checkRuns, checkIssues, documents, guidelines, theses } = schema;

export const ENGINE_VERSION = "rules-1.0";
export type CheckRunRow = typeof checkRuns.$inferSelect;
export type CheckIssueRow = typeof checkIssues.$inferSelect;

/** Empat kategori aturan (urutan tetap), ditambah "ai" hanya bila diminta. Bawaan tanpa AI. */
export function normalizeCheckTypes(requested?: string[] | null): IssueCategory[] {
  const types = requested && requested.length > 0 ? requested : [...CATEGORIES];
  const known = [...CATEGORIES, "ai"] as readonly string[];
  const unknown = types.filter((t) => !known.includes(t));
  if (unknown.length > 0)
    throw new AppError(`Jenis cek tidak dikenal: ${unknown.sort().join(", ")}`);
  const ordered: IssueCategory[] = CATEGORIES.filter((c) => types.includes(c));
  // Hanya "ai": tetap jalankan pemeriksaan aturan agar laporan lengkap.
  const base: IssueCategory[] = ordered.length > 0 ? ordered : [...CATEGORIES];
  return types.includes("ai") ? [...base, "ai"] : base;
}

/** Cek ber-AI hari ini (hari kalender WIB), tidak menghitung yang AI-nya gagal. */
export async function aiRunsToday(db: Executor, userId: string, now: Date): Promise<number> {
  const { start, end } = access.wibDayBounds(now);
  const [row] = await db
    .select({ n: count() })
    .from(checkRuns)
    .where(
      and(
        eq(checkRuns.requestedBy, userId),
        gte(checkRuns.createdAt, start),
        lt(checkRuns.createdAt, end),
        sql`'ai' = ANY(${checkRuns.checkTypes})`,
        or(isNull(checkRuns.aiStatus), ne(checkRuns.aiStatus, "failed")),
      ),
    );
  return row?.n ?? 0;
}

/** AI hanya bila sudah dihubungkan admin, paket (atau trial bila diizinkan), dan kuota harian belum habis. */
async function ensureCanUseAi(
  db: Executor,
  user: Pick<access.Profile, "id">,
  grantKind: string,
  now: Date,
): Promise<void> {
  const status = await getAiStatus(db);
  if (!status.available) {
    throw new CheckNotAllowed(
      "AI belum bisa digunakan. Pemilik belum menghubungkannya.",
      "ai_unavailable",
    );
  }
  if (grantKind !== "package" && !status.allow_trial) {
    throw new CheckNotAllowed("Analisis AI tersedia untuk pengguna paket.", "ai_package_only");
  }
  if ((await aiRunsToday(db, user.id, now)) >= status.daily_limit) {
    throw new CheckNotAllowed(
      `Batas analisis AI hari ini (${status.daily_limit} kali) sudah tercapai.`,
      "ai_daily_limit",
    );
  }
}

/** Satu transaksi: periksa hak akses, pakai jatah, buat check_run dengan snapshot pedoman. */
/** Snapshot pedoman dengan aturan pilihan pengguna dimatikan untuk cek ini saja (pedoman asli tidak berubah). */
function withSkippedRules(
  rules: Rules,
  skip: string[] | null | undefined,
  dictionary: Rules["dictionary"],
): Record<string, unknown> {
  const disabled = [...new Set([...rules.disabled_rules, ...(skip ?? [])])];
  return { ...rules, disabled_rules: disabled, dictionary } as unknown as Record<string, unknown>;
}

export async function createCheckRun(
  db: Db,
  user: Pick<access.Profile, "id">,
  thesis: Pick<Thesis, "id" | "guidelineId">,
  document: Pick<DocumentRow, "id" | "sha256">,
  requested?: string[] | null,
  now: Date = new Date(),
  skipRules?: string[] | null,
): Promise<CheckRunRow> {
  if (document.sha256 === null)
    throw new AppError("Unggahan belum selesai. Selesaikan unggah dulu.", "upload_pending");
  const types = normalizeCheckTypes(requested);

  // Rate limit pembuatan cek: maksimal 5 per menit per akun (selain batas harian di access).
  const [recent] = await db
    .select({ n: count() })
    .from(checkRuns)
    .where(
      and(
        eq(checkRuns.requestedBy, user.id),
        gte(checkRuns.createdAt, new Date(now.getTime() - 60_000)),
      ),
    );
  if ((recent?.n ?? 0) >= 5)
    throw new RateLimited("Terlalu banyak cek dalam semenit. Tunggu sebentar.");

  return db.transaction(async (tx) => {
    const grant = await access.ensureCanRunCheck(tx, user, now);
    if (types.includes("ai")) await ensureCanUseAi(tx, user, grant.kind, now);
    const [guideline] = await tx
      .select()
      .from(guidelines)
      .where(eq(guidelines.id, thesis.guidelineId));
    if (!guideline) throw new NotFound("Pedoman tidak ditemukan.");
    const [run] = await tx
      .insert(checkRuns)
      .values({
        documentId: document.id,
        requestedBy: user.id,
        accessGrantId: grant.id,
        // Snapshot: pedoman yang berubah kemudian tidak memengaruhi cek ini.
        guidelineSnapshot: withSkippedRules(
          resolveRules(guideline.rules),
          skipRules,
          await dictionarySnapshot(tx),
        ),
        checkTypes: types,
        status: "queued",
        engineVersion: ENGINE_VERSION,
        createdAt: now,
      })
      .returning();
    await access.consumeCheck(tx, grant.id);
    await tx.update(theses).set({ lastActivityAt: now }).where(eq(theses.id, thesis.id));
    return run!;
  });
}

export async function getOwnedRun(
  db: Db,
  user: Pick<access.Profile, "id" | "role">,
  runId: string,
): Promise<CheckRunRow> {
  const [run] = await db.select().from(checkRuns).where(eq(checkRuns.id, runId));
  if (!run || (run.requestedBy !== user.id && user.role !== "superadmin")) {
    throw new NotFound("Hasil cek tidak ditemukan.");
  }
  return run;
}

function headingPath(doc: ParsedDocument, index: number): string[] {
  let chapter: string | undefined;
  let sub: string | undefined;
  for (let i = Math.min(index, doc.paragraphs.length - 1); i >= 0; i--) {
    const p = doc.paragraphs[i]!;
    if (p.isToc) continue;
    if (sub === undefined && p.headingLevel !== null && p.headingLevel > 1)
      sub = p.text.trim().slice(0, 80);
    if (p.isChapterHeading || p.headingLevel === 1) {
      chapter = p.text.trim().slice(0, 80);
      break;
    }
  }
  return [chapter, sub].filter((x): x is string => !!x);
}

function withHeading(doc: ParsedDocument, issue: Issue): Issue {
  const loc = issue.location;
  if (!loc || loc.paragraphIndex == null || (loc.headingPath && loc.headingPath.length > 0))
    return issue;
  return { ...issue, location: { ...loc, headingPath: headingPath(doc, loc.paragraphIndex) } };
}

/** Untuk mencocokkan temuan antarversi (Fase 2). */
export function fingerprint(issue: Issue): string {
  const basis = [
    issue.ruleCode,
    (issue.excerpt ?? "").toLowerCase().split(/\s+/).join(" "),
    (issue.location?.headingPath ?? []).join("/"),
  ].join("|");
  return createHash("sha256").update(basis).digest("hex").slice(0, 32);
}

/** Murni: bytes .docx + rules -> daftar Issue. */
export function runPipeline(
  data: Uint8Array,
  rules: Record<string, unknown>,
  types: Category[],
): Issue[] {
  const doc = parseDocx(data);
  return runChecks(doc, resolveRules(rules), types).map((i) => withHeading(doc, i));
}

const isRuleCategory = (c: string): c is Category => (CATEGORIES as readonly string[]).includes(c);

// Pesan hanya ikut dicatat bila berupa kode tetap (snake_case), supaya tidak pernah memuat isi naskah.
const SAFE_CODE = /^[a-z][a-z0-9_]{0,59}$/;

const errorCodeOf = (e: unknown): string => {
  if (e instanceof AppError) return e.code;
  if (!(e instanceof Error)) return "unknown";
  return SAFE_CODE.test(e.message) ? e.message : e.name.slice(0, 60);
};

/**
 * Jalankan satu check_run. Idempoten: run yang sudah selesai atau gagal dikembalikan apa adanya.
 * Kegagalan apa pun menandai run `failed` dan mengembalikan jatah (bukan salah pengguna).
 */
export async function executeCheckRun(
  db: Db,
  storage: StorageClient,
  runId: string,
  log: (line: string) => void = console.info,
  /** Null bila AI belum dihubungkan; cek aturan tetap berjalan. */
  ai: AiClient | null = null,
): Promise<CheckRunRow> {
  const [existing] = await db.select().from(checkRuns).where(eq(checkRuns.id, runId));
  if (!existing) throw new NotFound("Hasil cek tidak ditemukan.");
  if (existing.status === "completed" || existing.status === "failed") return existing;

  // Klaim atomik: dua pemanggil bersamaan tidak menjalankan run yang sama dua kali.
  const claimed = await db
    .update(checkRuns)
    .set({ status: "processing", startedAt: new Date() })
    .where(and(eq(checkRuns.id, runId), eq(checkRuns.status, "queued")))
    .returning();
  if (claimed.length === 0)
    return (await db.select().from(checkRuns).where(eq(checkRuns.id, runId)))[0]!;
  const run = claimed[0]!;

  const started = Date.now();
  try {
    const [document] = await db.select().from(documents).where(eq(documents.id, run.documentId));
    if (!document || document.deletedAt !== null)
      throw new AppError("Naskah sudah dihapus.", "document_missing");

    const data = await storage.download(document.storageKey);
    const downloaded = Date.now();
    const requested = run.checkTypes as IssueCategory[];
    const ruleTypes = requested.filter(isRuleCategory);
    const rules = resolveRules(run.guidelineSnapshot);
    const doc = parseDocx(data);
    const parsed = Date.now();
    const ignored = await ignoreEntries(db, run.requestedBy);
    const issues: Issue[] = applyIgnores(runChecks(doc, rules, ruleTypes), ignored).map((i) =>
      withHeading(doc, i),
    );
    const checked = Date.now();

    // Analisis AI (opsional). Kegagalannya tidak menggagalkan cek: hasil aturan tetap disimpan.
    let aiStatus: string | null = null;
    let aiNote: string | null = null;
    const scored: IssueCategory[] = [...ruleTypes];
    if (requested.includes("ai")) {
      if (!ai) {
        aiStatus = "failed";
        aiNote = "AI belum bisa digunakan. Pemilik belum menghubungkannya.";
      } else {
        try {
          const maxChars = (await access.getAppSettings(db))["ai.max_chars"];
          const result = await runAiChecks(doc, ai, {
            maxChars,
            slot: (waitMs) => acquireAiSlot(db, waitMs),
          });
          aiStatus = result.status;
          aiNote = result.note;
          if (result.status !== "failed") {
            issues.push(...result.issues.map((i) => withHeading(doc, i)));
            scored.push("ai");
          }
        } catch (e) {
          // Kegagalan di sisi AI (antrean, pengaturan) tidak boleh menggagalkan cek aturan.
          aiStatus = "failed";
          aiNote = "Analisis AI gagal karena kesalahan sistem. Hasil cek aturan tetap tersedia.";
          log(`check_ai_failed run=${run.id} error=${errorCodeOf(e)}`);
        }
      }
    }
    const { total, byCategory } = computeScores(issues, scored, rules);
    const stats = computeStats(doc, rules);

    await db.transaction(async (tx) => {
      if (issues.length > 0) {
        await tx.insert(checkIssues).values(
          issues.map((i) => ({
            checkRunId: run.id,
            category: i.category,
            ruleCode: i.ruleCode,
            severity: i.severity,
            message: i.message,
            suggestion: i.suggestion || null,
            excerpt: i.excerpt ? i.excerpt.slice(0, 300) : null,
            location: {
              paragraph_index: i.location?.paragraphIndex ?? null,
              page: i.location?.page ?? null,
              heading_path: i.location?.headingPath ?? [],
              char_start: i.location?.charStart ?? null,
              char_end: i.location?.charEnd ?? null,
            },
            fingerprint: fingerprint(i),
          })),
        );
      }
      await tx
        .update(checkRuns)
        .set({
          status: "completed",
          scoreTotal: String(total),
          scoreByCategory: byCategory,
          issueCount: issues.length,
          stats,
          aiStatus,
          aiNote,
          finishedAt: new Date(),
        })
        .where(eq(checkRuns.id, run.id));
    });
    log(
      `check_completed run=${run.id} issues=${issues.length} ai=${aiStatus ?? "off"} bytes=${data.length} download_ms=${downloaded - started} parse_ms=${parsed - downloaded} rules_ms=${checked - parsed} duration_ms=${Date.now() - started}`,
    );
  } catch (e) {
    // Hanya kode error yang dicatat, tidak pernah pesan yang bisa memuat isi naskah.
    const code = errorCodeOf(e);
    await db
      .update(checkRuns)
      .set({ status: "failed", errorCode: code, finishedAt: new Date() })
      .where(eq(checkRuns.id, run.id));
    await access.refundCheck(db, run.id);
    log(`check_failed run=${run.id} error=${code}`);
  }
  return (await db.select().from(checkRuns).where(eq(checkRuns.id, runId)))[0]!;
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, major: 1, minor: 2 };

export async function listIssues(
  db: Db,
  run: Pick<CheckRunRow, "id">,
  filter: { category?: string; severity?: string } = {},
): Promise<CheckIssueRow[]> {
  const conditions = [eq(checkIssues.checkRunId, run.id)];
  if (filter.category) conditions.push(eq(checkIssues.category, filter.category));
  if (filter.severity) conditions.push(eq(checkIssues.severity, filter.severity));
  const rows = await db
    .select()
    .from(checkIssues)
    .where(and(...conditions))
    .orderBy(asc(checkIssues.createdAt), asc(checkIssues.id));
  return rows.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
}

export async function setIssueStatus(
  db: Db,
  run: Pick<CheckRunRow, "id">,
  issueId: string,
  status: "open" | "ignored" | "false_positive" | "done",
  storage?: StorageClient,
): Promise<CheckIssueRow> {
  const [issue] = await db
    .update(checkIssues)
    .set({ userStatus: status })
    .where(and(eq(checkIssues.id, issueId), eq(checkIssues.checkRunId, run.id)))
    .returning();
  if (!issue) throw new NotFound("Temuan tidak ditemukan.");
  // PDF laporan hanya memuat temuan terbuka, jadi salinan tersimpannya sudah usang.
  if (storage) await dropReportPdf(db, storage, run.id);
  return issue;
}

async function dropReportPdf(db: Db, storage: StorageClient, runId: string): Promise<void> {
  const [row] = await db
    .select({ storageKey: documents.storageKey })
    .from(checkRuns)
    .innerJoin(documents, eq(documents.id, checkRuns.documentId))
    .where(eq(checkRuns.id, runId));
  if (row) await storage.remove([reportPdfKey(row.storageKey, runId)]).catch(() => undefined);
}

export async function recentRuns(
  db: Db,
  user: Pick<access.Profile, "id">,
  limit = 20,
): Promise<CheckRunRow[]> {
  return db
    .select()
    .from(checkRuns)
    .where(eq(checkRuns.requestedBy, user.id))
    .orderBy(desc(checkRuns.createdAt))
    .limit(limit);
}

/**
 * Bandingkan cek ini dengan cek terakhir yang selesai pada versi naskah sebelumnya (skripsi yang sama).
 * Hanya kategori yang dijalankan di kedua cek yang dibandingkan, supaya kategori yang baru dipilih
 * tidak dihitung sebagai "temuan baru".
 */
/** Skor satu cek terakhir yang selesai untuk tiap versi naskah dalam satu skripsi, dari versi terlama. */
export async function scoreTrend(db: Db, run: CheckRunRow): Promise<ScoreTrendPoint[]> {
  const [current] = await db
    .select({ thesisId: documents.thesisId })
    .from(documents)
    .where(eq(documents.id, run.documentId));
  if (!current) throw new NotFound("Naskah tidak ditemukan.");
  const rows = await db
    .select({ run: checkRuns, versionNo: documents.versionNo })
    .from(checkRuns)
    .innerJoin(documents, eq(documents.id, checkRuns.documentId))
    .where(and(eq(documents.thesisId, current.thesisId), eq(checkRuns.status, "completed")))
    .orderBy(asc(documents.versionNo), desc(checkRuns.createdAt));
  const latest = new Map<number, ScoreTrendPoint>();
  for (const r of rows) {
    if (latest.has(r.versionNo) || r.run.scoreTotal === null) continue;
    latest.set(r.versionNo, {
      run_id: r.run.id,
      version_no: r.versionNo,
      score_total: Number(r.run.scoreTotal),
      issue_count: r.run.issueCount,
      created_at: r.run.createdAt.toISOString(),
    });
  }
  return [...latest.values()].sort((a, b) => a.version_no - b.version_no);
}

type StatsJson = Record<string, unknown> | null;

/** Jumlah kata per bab di kedua versi, untuk bab yang ada di cek sekarang. */
function chapterChanges(base: StatsJson, current: StatsJson): Comparison["chapters"] {
  const read = (s: StatsJson): Map<string, number> => {
    const list = Array.isArray(s?.chapters)
      ? (s.chapters as { name: string; words: number }[])
      : [];
    return new Map(list.map((c) => [c.name, c.words]));
  };
  if (!base || !current) return [];
  const before = read(base);
  return [...read(current)].map(([name, words]) => ({
    name,
    base_words: before.get(name) ?? 0,
    words,
  }));
}

export async function compareWithPrevious(db: Db, run: CheckRunRow): Promise<Comparison> {
  const [current] = await db
    .select({ versionNo: documents.versionNo, thesisId: documents.thesisId })
    .from(documents)
    .where(eq(documents.id, run.documentId));
  if (!current) throw new NotFound("Naskah tidak ditemukan.");

  const brief = (r: CheckRunRow, versionNo: number) => ({
    run_id: r.id,
    version_no: versionNo,
    score_total: r.scoreTotal === null ? null : Number(r.scoreTotal),
    created_at: r.createdAt.toISOString(),
  });

  const candidates = await db
    .select({ run: checkRuns, versionNo: documents.versionNo })
    .from(checkRuns)
    .innerJoin(documents, eq(documents.id, checkRuns.documentId))
    .where(
      and(
        eq(documents.thesisId, current.thesisId),
        lt(documents.versionNo, current.versionNo),
        eq(checkRuns.status, "completed"),
      ),
    )
    .orderBy(desc(documents.versionNo), desc(checkRuns.createdAt))
    .limit(1);
  const base = candidates[0];
  const empty = { fixed: 0, added: 0, remaining: 0 };
  if (!base) {
    return {
      base: null,
      current: brief(run, current.versionNo),
      counts: empty,
      score_delta: null,
      fixed: [],
      added: [],
      categories: [],
      chapters: [],
    };
  }

  const categories = (run.checkTypes as string[]).filter((c) =>
    (base.run.checkTypes as string[]).includes(c),
  );
  const [prevIssues, curIssues] = await Promise.all([
    db.select().from(checkIssues).where(eq(checkIssues.checkRunId, base.run.id)),
    db.select().from(checkIssues).where(eq(checkIssues.checkRunId, run.id)),
  ]);
  const result = compareIssues(prevIssues, curIssues, categories);
  const out = (i: CheckIssueRow) => issueOut(i);
  const delta =
    run.scoreTotal !== null && base.run.scoreTotal !== null
      ? Math.round((Number(run.scoreTotal) - Number(base.run.scoreTotal)) * 10) / 10
      : null;
  return {
    base: brief(base.run, base.versionNo),
    current: brief(run, current.versionNo),
    counts: {
      fixed: result.fixed.length,
      added: result.added.length,
      remaining: result.remaining.length,
    },
    score_delta: delta,
    fixed: result.fixed.map(out),
    added: result.added.map(out),
    categories,
    chapters: chapterChanges(base.run.stats, run.stats),
  };
}
