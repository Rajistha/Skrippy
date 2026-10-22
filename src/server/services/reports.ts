import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";
import { AppError, NotFound } from "../errors";
import type { StorageClient } from "../integrations/storage";
import { annotateDocx, type AnnotationComment } from "../reports/annotate-docx";
import { findSections } from "../checkers/structure/rules";
import { reportPdfKey } from "../reports/cache-key";
import { fixDocx } from "../reports/fix-docx";
import type { ParagraphFix } from "../reports/fix-format";
import { resolveRules } from "../checkers/rules";
import { bodyParagraphs, type Rules } from "../checkers/types";
import { buildHighlightPdf, type HighlightIssue } from "../reports/highlight-pdf";
import { parseDocx } from "../checkers/parse/document";
import { listIssues, type CheckIssueRow, type CheckRunRow } from "./checks";

const { documents, theses } = schema;

function ensureCompleted(run: CheckRunRow): void {
  if (run.status !== "completed") throw new AppError("Laporan belum selesai.", "run_not_ready");
}

async function context(db: Db, run: CheckRunRow) {
  const [row] = await db
    .select({ doc: documents, title: theses.title })
    .from(documents)
    .innerJoin(theses, eq(theses.id, documents.thesisId))
    .where(eq(documents.id, run.documentId));
  if (!row) throw new NotFound("Naskah tidak ditemukan.");
  return row;
}

/** Hanya temuan yang masih terbuka; yang diabaikan pengguna tidak dicetak atau dikomentari. */
const openOnly = (issues: CheckIssueRow[]): CheckIssueRow[] =>
  issues.filter((i) => i.userStatus === "open");

async function loadOriginal(storage: StorageClient, key: string): Promise<Uint8Array> {
  try {
    return await storage.download(key);
  } catch {
    throw new NotFound("File naskah tidak ditemukan.");
  }
}

const baseName = (filename: string): string =>
  filename
    .replace(/\.docx$/i, "")
    .replace(/[^\w\- ]+/g, "")
    .trim() || "naskah";

/** PDF naskah dengan teks bermasalah disorot. Teks disusun ulang (halaman Word tidak dirender di server). */
export async function buildHighlightedPdf(
  db: Db,
  storage: StorageClient,
  run: CheckRunRow,
): Promise<{ bytes: Uint8Array; filename: string }> {
  ensureCompleted(run);
  const { doc, title } = await context(db, run);
  if (doc.deletedAt !== null) throw new NotFound("Naskah sudah dihapus.");
  const filename = `${baseName(doc.originalFilename)}-skrippy.pdf`;
  // Salinan dari unduhan sebelumnya; dibuang saat status temuan berubah atau naskah dihapus.
  const cacheKey = reportPdfKey(doc.storageKey, run.id);
  const cached = await storage.download(cacheKey).catch(() => null);
  if (cached) return { bytes: cached, filename };
  const parsed = parseDocx(await loadOriginal(storage, doc.storageKey));
  const issues: HighlightIssue[] = openOnly(await listIssues(db, run)).map((i) => ({
    severity: i.severity as HighlightIssue["severity"],
    ruleCode: i.ruleCode,
    message: i.message,
    suggestion: i.suggestion,
    excerpt: i.excerpt,
    paragraphIndex:
      typeof i.location.paragraph_index === "number" ? i.location.paragraph_index : null,
  }));
  const bytes = await buildHighlightPdf({
    title,
    versionNo: doc.versionNo,
    paragraphs: parsed.paragraphs
      .filter((p) => p.text.trim() !== "")
      .map((p) => ({
        index: p.index,
        text: p.text,
        kind: p.isToc ? "toc" : p.headingLevel !== null || p.isChapterHeading ? "heading" : "body",
        align: p.alignment ?? "left",
      })),
    issues,
  });
  await storage.save(cacheKey, bytes, "application/pdf").catch(() => undefined);
  return { bytes, filename };
}

/** Salinan .docx dengan teks bermasalah disorot (tanpa komentar). Tata letak aslinya tetap utuh. */
export async function buildHighlightedDocx(
  db: Db,
  storage: StorageClient,
  run: CheckRunRow,
): Promise<{ bytes: Uint8Array; filename: string; highlighted: number }> {
  ensureCompleted(run);
  const { doc } = await context(db, run);
  if (doc.deletedAt !== null) throw new NotFound("Naskah sudah dihapus.");
  const marks: AnnotationComment[] = [];
  for (const i of openOnly(await listIssues(db, run))) {
    const index = i.location.paragraph_index;
    if (typeof index !== "number") continue;
    marks.push({
      paragraphIndex: index,
      text: i.message,
      severity: i.severity as "critical" | "major" | "minor",
      excerpt: i.excerpt,
    });
  }
  const original = await loadOriginal(storage, doc.storageKey);
  const bytes = annotateDocx(original, marks, new Date(), { comments: false });
  return {
    bytes,
    filename: `${baseName(doc.originalFilename)}-skrippy.docx`,
    highlighted: marks.length,
  };
}

const spacingOk = (actual: number, allowed: number | number[]): boolean =>
  (Array.isArray(allowed) ? allowed : [allowed]).some((a) => Math.abs(actual - a) < 0.06);

/** Paragraf isi (sebelum daftar pustaka) yang huruf, ukuran, atau spasinya menyimpang dari pedoman. */
function formatFixes(
  doc: ReturnType<typeof parseDocx>,
  rules: Rules,
  until: number | null,
): Map<number, ParagraphFix> {
  const out = new Map<number, ParagraphFix>();
  const font = rules.body.font_family.toLowerCase();
  for (const p of bodyParagraphs(doc)) {
    if (until !== null && p.index >= until) continue;
    const fix: ParagraphFix = {
      font: p.runs.some((r) => r.fontName !== null && r.fontName.toLowerCase() !== font),
      size: p.runs.some((r) => r.fontSizePt !== null && r.fontSizePt !== rules.body.font_size_pt),
      spacing: p.lineSpacing !== null && !spacingOk(p.lineSpacing, rules.body.line_spacing),
    };
    if (fix.font || fix.size || fix.spacing) out.set(p.index, fix);
  }
  return out;
}

/** Salinan .docx dengan kesalahan ejaan yang aman diperbaiki otomatis. Daftar pustaka tidak diubah. */
export async function buildFixedDocx(
  db: Db,
  storage: StorageClient,
  run: CheckRunRow,
): Promise<{ bytes: Uint8Array; filename: string; changes: number }> {
  ensureCompleted(run);
  const { doc } = await context(db, run);
  if (doc.deletedAt !== null) throw new NotFound("Naskah sudah dihapus.");
  const original = await loadOriginal(storage, doc.storageKey);
  const parsed = parseDocx(original);
  const bibliography = findSections(parsed, ["DAFTAR PUSTAKA"]).get("DAFTAR PUSTAKA");
  const until = bibliography ? bibliography.index : null;
  const rules = resolveRules(run.guidelineSnapshot);
  const { bytes, total } = fixDocx(original, until, {
    rules,
    paragraphs: formatFixes(parsed, rules, until),
  });
  return {
    bytes,
    filename: `${baseName(doc.originalFilename)}-rapi.docx`,
    changes: total,
  };
}
