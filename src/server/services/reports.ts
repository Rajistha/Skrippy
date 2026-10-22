import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { schema } from "../db";
import { AppError, NotFound } from "../errors";
import type { StorageClient } from "../integrations/storage";
import { findSections } from "../checkers/structure/rules";
import { foreignTermRegex, hasUnitalicForeignTerm } from "../checkers/spelling/rules";
import { reportPdfKey } from "../reports/cache-key";
import { fixDocx } from "../reports/fix-docx";
import type { ParagraphFix } from "../reports/fix-format";
import { resolveRules } from "../checkers/rules";
import { bodyParagraphs, type Rules } from "../checkers/types";
import { buildHighlightPdf, type HighlightIssue } from "../reports/highlight-pdf";
import { buildIssuesPdf, type IssuesPdfItem } from "../reports/issues-pdf";
import { t } from "@/lib/i18n/id";
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

/**
 * Nama berkas unduhan: Skrippy_<Jenis-Laporan>_<nama-naskah>_v<versi>.<ekstensi>.
 * Hanya huruf, angka, garis bawah, dan tanda hubung supaya aman di semua sistem dan di header HTTP.
 */
export function downloadName(
  kind: "Laporan-Temuan" | "Naskah-Bersorot" | "Naskah-Rapi",
  originalFilename: string,
  versionNo: number,
  ext: "pdf" | "docx",
): string {
  const stem = baseName(originalFilename).replace(/\s+/g, "-").slice(0, 60) || "naskah";
  return `Skrippy_${kind}_${stem}_v${versionNo}.${ext}`;
}

/** PDF naskah dengan teks bermasalah disorot. Teks disusun ulang (halaman Word tidak dirender di server). */
export async function buildHighlightedPdf(
  db: Db,
  storage: StorageClient,
  run: CheckRunRow,
): Promise<{ bytes: Uint8Array; filename: string }> {
  ensureCompleted(run);
  const { doc, title } = await context(db, run);
  if (doc.deletedAt !== null) throw new NotFound("Naskah sudah dihapus.");
  const filename = downloadName("Naskah-Bersorot", doc.originalFilename, doc.versionNo, "pdf");
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
    generatedAt: new Date(),
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

/** Teks letak singkat dari lokasi temuan; kosong bila temuan berlaku untuk seluruh naskah. */
function locationText(location: Record<string, unknown>): string {
  const path = Array.isArray(location.heading_path)
    ? location.heading_path.filter((h): h is string => typeof h === "string")
    : [];
  const parts: string[] = [];
  if (path.length > 0) parts.push(path.join(" > "));
  if (typeof location.page === "number") parts.push(`halaman ${location.page}`);
  else if (typeof location.paragraph_index === "number")
    parts.push(`paragraf ${location.paragraph_index + 1}`);
  return parts.join(", ");
}

/** PDF ringkas berisi skor dan semua temuan terbuka. Tidak mengunduh naskah, hanya membaca hasil cek. */
export async function buildIssuesListPdf(
  db: Db,
  run: CheckRunRow,
): Promise<{ bytes: Uint8Array; filename: string }> {
  ensureCompleted(run);
  const { doc, title } = await context(db, run);
  const categoryLabel = (c: string): string => (t.checks as Record<string, string>)[c] ?? c;
  const issues: IssuesPdfItem[] = openOnly(await listIssues(db, run)).map((i) => ({
    severity: i.severity as IssuesPdfItem["severity"],
    ruleCode: i.ruleCode,
    categoryLabel: categoryLabel(i.category),
    message: i.message,
    suggestion: i.suggestion,
    excerpt: i.excerpt,
    location: locationText(i.location),
  }));
  const bytes = await buildIssuesPdf({
    title,
    versionNo: doc.versionNo,
    generatedAt: new Date(),
    scoreTotal: run.scoreTotal === null ? null : Number(run.scoreTotal),
    categoryScores: Object.entries(run.scoreByCategory ?? {}).map(([c, score]) => ({
      label: categoryLabel(c),
      score,
    })),
    issues,
  });
  return {
    bytes,
    filename: downloadName("Laporan-Temuan", doc.originalFilename, doc.versionNo, "pdf"),
  };
}

const spacingOk = (actual: number, allowed: number | number[]): boolean =>
  (Array.isArray(allowed) ? allowed : [allowed]).some((a) => Math.abs(actual - a) < 0.06);

const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/** Paragraf isi (sebelum daftar pustaka) yang format atau istilah asingnya menyimpang dari pedoman. */
function formatFixes(
  doc: ReturnType<typeof parseDocx>,
  rules: Rules,
  until: number | null,
): Map<number, ParagraphFix> {
  const out = new Map<number, ParagraphFix>();
  const font = rules.body.font_family.toLowerCase();
  const foreign = foreignTermRegex(rules.dictionary?.foreign ?? []);
  for (const p of bodyParagraphs(doc)) {
    if (until !== null && p.index >= until) continue;
    // Batas 8 kata sama dengan pemeriksa FMT-006 dan FMT-007: paragraf pendek tidak ditandai, jadi tidak diubah.
    const long = wordCount(p.text) >= 8;
    const fix: ParagraphFix = {
      font: p.runs.some((r) => r.fontName !== null && r.fontName.toLowerCase() !== font),
      size: p.runs.some((r) => r.fontSizePt !== null && r.fontSizePt !== rules.body.font_size_pt),
      spacing: p.lineSpacing !== null && !spacingOk(p.lineSpacing, rules.body.line_spacing),
      indent: long && Math.abs((p.firstLineIndentCm ?? 0) - rules.body.first_line_indent_cm) > 0.15,
      align: long && (p.alignment ?? "left") !== rules.body.alignment,
      italic: hasUnitalicForeignTerm(p, foreign),
    };
    if (Object.values(fix).some(Boolean)) out.set(p.index, fix);
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
    filename: downloadName("Naskah-Rapi", doc.originalFilename, doc.versionNo, "docx"),
    changes: total,
  };
}
