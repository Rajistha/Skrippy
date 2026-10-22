/** Aturan format tambahan (Gelombang 1 dan 2): subbab, daftar pustaka, rujukan silang, gambar, tabel, persamaan. */
import { findSections } from "../structure/rules";
import type { Checker, Issue, ParsedDocument, ParsedParagraph } from "../types";
import { isHeading } from "../types";

const MAX_PER_RULE = 25;
const cap = (issues: Issue[]): Issue[] => issues.slice(0, MAX_PER_RULE);
const excerptOf = (p: ParsedParagraph): string => p.text.trim().slice(0, 120);
const SUBHEADING = /^\s*\d+\.\d+(?:\.\d+)*\.?\s+\S/;
const SMALL_WORDS = new Set([
  "dan",
  "di",
  "ke",
  "dari",
  "yang",
  "untuk",
  "pada",
  "dengan",
  "atau",
  "dalam",
  "atas",
  "bagi",
  "serta",
  "oleh",
  "terhadap",
]);

/** Subbab bernomor ("1.1 Latar Belakang") atau berstyle Heading 2 ke atas. */
export function isSubheading(p: ParsedParagraph): boolean {
  if (p.isToc || p.text.length > 150) return false;
  return (p.headingLevel !== null && p.headingLevel >= 2) || SUBHEADING.test(p.text);
}

const TABLE_CAPTION = /^\s*Tabel\s+(\d+(?:\.\d+)?)/i;
const FIGURE_CAPTION = /^\s*Gambar\s+(\d+(?:\.\d+)?)/i;
const REFERENCE = /\b(Tabel|Gambar)\s+(\d+(?:\.\d+)?)\b/g;

/** Posisi pertama paragraf isi ("badan") : sesudah semua bagian awal. Dipakai agar halaman judul dilewati. */
function firstFrontMatterIndex(doc: ParsedDocument, names: string[]): number {
  const found = findSections(doc, names);
  const idx = [...found.values()].map((p) => p.index);
  return idx.length > 0 ? Math.min(...idx) : 0;
}

const near = (doc: ParsedDocument, at: number, offset: number) => {
  const e = doc.elements[at + offset];
  return e?.kind === "p" ? doc.paragraphs[e.index] : undefined;
};

function elementIndex(doc: ParsedDocument, paragraphIndex: number): number {
  return doc.elements.findIndex((e) => e.kind === "p" && e.index === paragraphIndex);
}

type Caption = { kind: "Tabel" | "Gambar"; number: string; paragraph: ParsedParagraph };

/** Caption sungguhan: paragraf "Tabel N"/"Gambar N" yang bersebelahan dengan tabel atau gambar. */
export function captions(doc: ParsedDocument): Caption[] {
  const out: Caption[] = [];
  for (const p of doc.paragraphs) {
    if (p.isToc || p.text.length > 250) continue;
    const t = TABLE_CAPTION.exec(p.text);
    const f = FIGURE_CAPTION.exec(p.text);
    if (!t && !f) continue;
    const at = elementIndex(doc, p.index);
    if (t) {
      if (doc.elements[at - 1]?.kind === "tbl" || doc.elements[at + 1]?.kind === "tbl")
        out.push({ kind: "Tabel", number: t[1]!, paragraph: p });
    } else if (f) {
      if (near(doc, at, -1)?.hasDrawing || near(doc, at, 1)?.hasDrawing)
        out.push({ kind: "Gambar", number: f[1]!, paragraph: p });
    }
  }
  return out;
}

export const subheadingFormat: Checker = {
  code: "FMT-012",
  category: "format",
  defaultSeverity: "minor",
  run(doc, rules) {
    const { bold, capitalization } = rules.subheading;
    const issues: Issue[] = [];
    for (const p of doc.paragraphs) {
      if (!isSubheading(p) || p.runs.length === 0) continue;
      const label = p.text.trim().slice(0, 80);
      if (bold && !p.runs.every((r) => r.bold || r.text.trim() === "")) {
        issues.push({
          category: "format",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: "Judul subbab belum dicetak tebal.",
          suggestion: "Cetak tebal judul subbab.",
          excerpt: label,
          location: { paragraphIndex: p.index, page: p.page },
        });
        continue;
      }
      if (capitalization === "title") {
        const title = p.text.trim().replace(/^\d+(?:\.\d+)*\.?\s+/, "");
        const bad = title
          .split(/\s+/)
          .filter((w, i) => /^\p{Ll}/u.test(w) && (i === 0 || !SMALL_WORDS.has(w.toLowerCase())));
        if (bad.length > 0) {
          issues.push({
            category: "format",
            ruleCode: this.code,
            severity: this.defaultSeverity,
            message: `Judul subbab seharusnya diawali huruf kapital di tiap kata, "${bad[0]}" masih huruf kecil.`,
            suggestion: "Ubah ke huruf kapital di awal tiap kata (kecuali kata sambung).",
            excerpt: label,
            location: { paragraphIndex: p.index, page: p.page },
          });
        }
      }
    }
    return cap(issues);
  },
};

function bibliographyParagraphs(doc: ParsedDocument): ParsedParagraph[] {
  const start = findSections(doc, ["DAFTAR PUSTAKA"]).get("DAFTAR PUSTAKA");
  if (!start) return [];
  return doc.paragraphs.filter(
    (p) => p.index > start.index && !p.isToc && !isHeading(p) && p.text.trim() !== "",
  );
}

export const referenceSpacing: Checker = {
  code: "FMT-013",
  category: "format",
  defaultSeverity: "minor",
  run(doc, rules) {
    const want = rules.reference_line_spacing;
    const issues: Issue[] = [];
    for (const p of bibliographyParagraphs(doc)) {
      if (p.lineSpacing === null || Math.abs(p.lineSpacing - want) < 0.1) continue;
      issues.push({
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Spasi daftar pustaka ${String(p.lineSpacing).replace(".", ",")}, seharusnya ${String(want).replace(".", ",")}.`,
        suggestion: `Ubah spasi entri daftar pustaka menjadi ${String(want).replace(".", ",")}.`,
        excerpt: excerptOf(p),
        location: { paragraphIndex: p.index, page: p.page },
      });
    }
    return cap(issues);
  },
};

export const hangingIndent: Checker = {
  code: "FMT-015",
  category: "format",
  defaultSeverity: "minor",
  run(doc) {
    const entries = bibliographyParagraphs(doc);
    if (entries.length === 0) return [];
    const missing = entries.filter((p) => (p.firstLineIndentCm ?? 0) > -0.5);
    if (missing.length === 0) return [];
    const first = missing[0]!;
    return [
      {
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `${missing.length} dari ${entries.length} entri daftar pustaka belum memakai indentasi gantung.`,
        suggestion: "Atur indentasi gantung (hanging) 1,25 cm pada seluruh entri daftar pustaka.",
        excerpt: excerptOf(first),
        location: { paragraphIndex: first.index, page: first.page },
      },
    ];
  },
};

const YEAR = /\b(?:19|20)\d{2}\b/;
const STUDENT_ID = /\b\d{8,15}\b/;

export const titlePage: Checker = {
  code: "FMT-016",
  category: "format",
  defaultSeverity: "minor",
  run(doc, rules) {
    const others = rules.required_sections.filter((n) => n.toUpperCase() !== "HALAMAN JUDUL");
    const end = firstFrontMatterIndex(doc, others);
    const page = doc.paragraphs.filter((p) => p.index < end && p.text.trim() !== "");
    const hasAny = doc.paragraphs.some((p) => p.index < end && (p.hasDrawing || p.text.trim()));
    if (!hasAny) return []; // tidak ada halaman judul terbaca: STR-001 yang melapor
    const text = page.map((p) => p.text).join(" ");
    const missing: string[] = [];
    if (!doc.paragraphs.some((p) => p.index < end && p.hasDrawing)) missing.push("logo kampus");
    if (!STUDENT_ID.test(text)) missing.push("NIM");
    if (!YEAR.test(text)) missing.push("tahun");
    if (missing.length === 0) return [];
    return [
      {
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Halaman judul belum memuat ${missing.join(", ")}.`,
        suggestion: `Lengkapi halaman judul dengan ${missing.join(", ")}.`,
        location: { paragraphIndex: page[0]?.index ?? 0, headingPath: ["Halaman judul"] },
      },
    ];
  },
};

function referencedKeys(doc: ParsedDocument, skip: Set<number>): Map<string, ParsedParagraph> {
  const found = new Map<string, ParsedParagraph>();
  for (const p of doc.paragraphs) {
    if (p.isToc || skip.has(p.index)) continue;
    for (const m of p.text.matchAll(REFERENCE)) {
      const key = `${m[1]!.toLowerCase()} ${m[2]}`;
      if (!found.has(key)) found.set(key, p);
    }
  }
  return found;
}

export const referencedMissingCaption: Checker = {
  code: "FMT-017",
  category: "format",
  defaultSeverity: "minor",
  run(doc) {
    const caps = captions(doc);
    const have = new Set(caps.map((c) => `${c.kind.toLowerCase()} ${c.number}`));
    const skip = new Set(caps.map((c) => c.paragraph.index));
    const issues: Issue[] = [];
    for (const [key, p] of referencedKeys(doc, skip)) {
      if (have.has(key)) continue;
      const label = key.replace(/^./, (c) => c.toUpperCase());
      issues.push({
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `${label} dirujuk di teks tetapi tidak ada caption-nya.`,
        suggestion: `Tambahkan caption "${label}" atau perbaiki nomor rujukan.`,
        excerpt: excerptOf(p),
        location: { paragraphIndex: p.index, page: p.page },
      });
    }
    return cap(issues);
  },
};

export const captionNeverReferenced: Checker = {
  code: "FMT-018",
  category: "format",
  defaultSeverity: "minor",
  run(doc) {
    const caps = captions(doc);
    const skip = new Set(caps.map((c) => c.paragraph.index));
    const used = new Set(referencedKeys(doc, skip).keys());
    const issues: Issue[] = [];
    for (const c of caps) {
      if (used.has(`${c.kind.toLowerCase()} ${c.number}`)) continue;
      issues.push({
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `${c.kind} ${c.number} tidak pernah dirujuk di teks.`,
        suggestion: `Sebut "${c.kind} ${c.number}" di paragraf yang membahasnya.`,
        excerpt: excerptOf(c.paragraph),
        location: { paragraphIndex: c.paragraph.index, page: c.paragraph.page },
      });
    }
    return cap(issues);
  },
};

function textWidthCm(doc: ParsedDocument, sectionIndex: number): number | null {
  const s = doc.sections[Math.min(sectionIndex, doc.sections.length - 1)];
  if (!s || s.pageWidthCm === 0) return null;
  return s.pageWidthCm - s.marginLeftCm - s.marginRightCm;
}

export const overWidth: Checker = {
  code: "FMT-019",
  category: "format",
  defaultSeverity: "major",
  run(doc, rules) {
    const tolerance = rules.page.margin_tolerance_cm;
    const issues: Issue[] = [];
    for (const p of doc.paragraphs) {
      if (p.imageWidthCm === null) continue;
      const width = textWidthCm(doc, p.sectionIndex);
      if (width === null || p.imageWidthCm <= width + tolerance) continue;
      issues.push({
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Gambar selebar ${p.imageWidthCm.toFixed(1).replace(".", ",")} cm melebihi lebar teks ${width.toFixed(1).replace(".", ",")} cm.`,
        suggestion: "Kecilkan gambar agar tidak melewati margin.",
        location: { paragraphIndex: p.index, page: p.page },
      });
    }
    for (const t of doc.tables) {
      if (t.widthCm === null) continue;
      let sectionIndex = 0;
      for (let i = t.elementIndex - 1; i >= 0; i--) {
        const e = doc.elements[i];
        if (e?.kind === "p") {
          sectionIndex = doc.paragraphs[e.index]?.sectionIndex ?? 0;
          break;
        }
      }
      const width = textWidthCm(doc, sectionIndex);
      if (width === null || t.widthCm <= width + tolerance) continue;
      const before = near(doc, t.elementIndex, -1);
      issues.push({
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Tabel selebar ${t.widthCm.toFixed(1).replace(".", ",")} cm melebihi lebar teks ${width.toFixed(1).replace(".", ",")} cm.`,
        suggestion: "Kecilkan tabel agar tidak melewati margin.",
        location: before ? { paragraphIndex: before.index, page: before.page } : {},
      });
    }
    return cap(issues);
  },
};

export const figureWithoutCaption: Checker = {
  code: "FMT-020",
  category: "format",
  defaultSeverity: "minor",
  run(doc, rules) {
    const start = firstFrontMatterIndex(
      doc,
      rules.required_sections.filter((n) => /^BAB\b/i.test(n)),
    );
    const issues: Issue[] = [];
    for (const p of doc.paragraphs) {
      if (!p.hasDrawing || p.index < start || (p.imageWidthCm ?? 99) < 3) continue;
      const at = elementIndex(doc, p.index);
      const around = [near(doc, at, -1), near(doc, at, 1)];
      if (around.some((q) => q && FIGURE_CAPTION.test(q.text))) continue;
      issues.push({
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: "Gambar belum punya caption.",
        suggestion: 'Tambahkan caption bernomor, misalnya "Gambar 2.1 Judul gambar".',
        location: { paragraphIndex: p.index, page: p.page },
      });
    }
    return cap(issues);
  },
};

export const tableWithoutCaption: Checker = {
  code: "FMT-021",
  category: "format",
  defaultSeverity: "minor",
  run(doc) {
    const issues: Issue[] = [];
    for (const t of doc.tables) {
      const around = [near(doc, t.elementIndex, -1), near(doc, t.elementIndex, 1)];
      if (around.some((q) => q && TABLE_CAPTION.test(q.text))) continue;
      const anchor = around[0] ?? around[1];
      issues.push({
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: "Tabel belum punya caption.",
        suggestion: 'Tambahkan caption bernomor, misalnya "Tabel 3.1 Judul tabel".',
        location: anchor ? { paragraphIndex: anchor.index, page: anchor.page } : {},
      });
    }
    return cap(issues);
  },
};

export const equationNumbering: Checker = {
  code: "FMT-022",
  category: "format",
  defaultSeverity: "minor",
  run(doc) {
    const issues: Issue[] = [];
    for (const p of doc.paragraphs) {
      if (!p.hasMath || /\(\d+(?:\.\d+)?\)/.test(p.text)) continue;
      issues.push({
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: "Persamaan belum diberi nomor.",
        suggestion: "Beri nomor persamaan di tepi kanan, misalnya (2.1).",
        location: { paragraphIndex: p.index, page: p.page },
      });
    }
    return cap(issues);
  },
};

export const leftoverReview: Checker = {
  code: "FMT-023",
  category: "format",
  defaultSeverity: "major",
  run(doc) {
    const parts: string[] = [];
    if (doc.revisions > 0) parts.push(`${doc.revisions} perubahan terlacak (track changes)`);
    if (doc.commentCount > 0) parts.push(`${doc.commentCount} komentar`);
    if (parts.length === 0) return [];
    return [
      {
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Naskah masih memuat ${parts.join(" dan ")}.`,
        suggestion: "Terima atau tolak semua perubahan dan hapus komentar sebelum dikumpulkan.",
      },
    ];
  },
};

export const headerConsistency: Checker = {
  code: "FMT-024",
  category: "format",
  defaultSeverity: "minor",
  run(doc) {
    // Hanya bagian isi (sesudah bagian pertama): sebagian berheader dan sebagian tidak.
    const body = doc.sections.slice(1);
    const withText = body.filter((s) => s.hasHeaderText);
    if (body.length < 2 || withText.length === 0 || withText.length === body.length) return [];
    const missing = body.find((s) => !s.hasHeaderText)!;
    return [
      {
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Header tidak konsisten: ${withText.length} dari ${body.length} bagian memuat teks header, bagian ${missing.index + 1} tidak.`,
        suggestion: "Samakan header di semua bagian, atau kosongkan di semuanya.",
        location: { headingPath: [`Bagian ${missing.index + 1}`] },
      },
    ];
  },
};

export const footnoteUse: Checker = {
  code: "FMT-025",
  category: "format",
  defaultSeverity: "minor",
  run(doc, rules) {
    const style = rules.citation.style.toLowerCase();
    if (doc.footnoteCount === 0 || (style !== "apa" && style !== "ieee")) return [];
    return [
      {
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Naskah memuat ${doc.footnoteCount} catatan kaki, padahal gaya ${style.toUpperCase()} memakai sitasi di dalam teks.`,
        suggestion:
          "Pindahkan rujukan ke sitasi di teks, kecuali pedoman mengizinkan catatan kaki.",
      },
    ];
  },
};

export const documentProperties: Checker = {
  code: "FMT-026",
  category: "format",
  defaultSeverity: "minor",
  run(doc) {
    if (!doc.meta) return [];
    const missing = [!doc.meta.title && "judul", !doc.meta.author && "penulis"].filter(
      (x): x is string => typeof x === "string",
    );
    if (missing.length === 0) return [];
    return [
      {
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Properti dokumen belum memuat ${missing.join(" dan ")}.`,
        suggestion: "Isi lewat File > Info > Properties agar identitas file jelas.",
      },
    ];
  },
};

export const imageAltText: Checker = {
  code: "FMT-027",
  category: "format",
  defaultSeverity: "minor",
  run(doc, rules) {
    const start = firstFrontMatterIndex(
      doc,
      rules.required_sections.filter((n) => /^BAB/i.test(n)),
    );
    const issues: Issue[] = [];
    for (const p of doc.paragraphs) {
      if (!p.imageAltMissing || p.index < start || (p.imageWidthCm ?? 99) < 3) continue;
      issues.push({
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: "Gambar belum punya teks alternatif.",
        suggestion: "Klik kanan gambar > View Alt Text, lalu tulis deskripsi singkat isi gambar.",
        location: { paragraphIndex: p.index, page: p.page },
      });
    }
    return cap(issues);
  },
};

export const tableHeaderRow: Checker = {
  code: "FMT-028",
  category: "format",
  defaultSeverity: "minor",
  run(doc) {
    const issues: Issue[] = [];
    for (const t of doc.tables) {
      if (t.rows < 3 || t.hasHeaderRow) continue;
      const anchor = near(doc, t.elementIndex, -1) ?? near(doc, t.elementIndex, 1);
      issues.push({
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Tabel ${t.rows} baris belum menandai baris pertama sebagai baris judul.`,
        suggestion: "Pilih baris pertama, Table Layout > Repeat Header Rows.",
        location: anchor ? { paragraphIndex: anchor.index, page: anchor.page } : {},
      });
    }
    return cap(issues);
  },
};

export const tableFontCheck: Checker = {
  code: "FMT-029",
  category: "format",
  defaultSeverity: "minor",
  run(doc, rules) {
    const want = rules.body.font_family.toLowerCase();
    const maxSize = rules.body.font_size_pt;
    const issues: Issue[] = [];
    for (const t of doc.tables) {
      const problems: string[] = [];
      if (t.fontName && t.fontName.toLowerCase() !== want)
        problems.push(`jenis huruf ${t.fontName}, seharusnya ${rules.body.font_family}`);
      if (t.fontSizePt && t.fontSizePt > maxSize)
        problems.push(`ukuran huruf ${t.fontSizePt} pt, melebihi ${maxSize} pt`);
      if (problems.length === 0) continue;
      const anchor = near(doc, t.elementIndex, -1) ?? near(doc, t.elementIndex, 1);
      issues.push({
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Isi tabel memakai ${problems.join(" dan ")}.`,
        suggestion: "Samakan huruf tabel dengan huruf isi naskah (ukuran boleh lebih kecil).",
        location: anchor ? { paragraphIndex: anchor.index, page: anchor.page } : {},
      });
    }
    return cap(issues);
  },
};

export const formatExtraCheckers: Checker[] = [
  imageAltText,
  tableHeaderRow,
  tableFontCheck,
  headerConsistency,
  footnoteUse,
  documentProperties,
  subheadingFormat,
  referenceSpacing,
  hangingIndent,
  titlePage,
  referencedMissingCaption,
  captionNeverReferenced,
  overWidth,
  figureWithoutCaption,
  tableWithoutCaption,
  equationNumbering,
  leftoverReview,
];
