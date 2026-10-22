/** Tipe inti mesin pemeriksa. Murni: tanpa I/O, tanpa process.env. */

export type Category = "format" | "structure" | "spelling" | "citation";
export type Severity = "critical" | "major" | "minor";
/** Kategori temuan: empat kategori aturan, ditambah "ai" untuk analisis AI (Fase 3, opsional). */
export type IssueCategory = Category | "ai";

export const CATEGORIES: readonly Category[] = ["format", "structure", "spelling", "citation"];

/** Konfigurasi pedoman (JSON). Nilainya selalu diambil dari sini, bukan ditulis di kode. */
export type Rules = {
  page: {
    size: string;
    margins_cm: { left: number; top: number; right: number; bottom: number };
    margin_tolerance_cm: number;
  };
  body: {
    font_family: string;
    font_size_pt: number;
    line_spacing: number | number[];
    first_line_indent_cm: number;
    alignment: "left" | "center" | "right" | "justify";
  };
  chapter_heading: {
    pattern: string;
    uppercase: boolean;
    alignment: "left" | "center" | "right" | "justify";
    bold: boolean;
  };
  page_numbering: { front_matter: string; body: string; body_starts_at: string };
  captions: {
    table_position: "above" | "below";
    figure_position: "above" | "below";
    numbering: string;
  };
  required_sections: string[];
  abstract_words: { min: number; max: number };
  /** Kamus tambahan dari admin, disalin ke snapshot saat cek dibuat (EJA-001, EJA-006). */
  dictionary?: { nonstandard: Record<string, string>; foreign: string[] };
  /** Batas bawah jumlah kata satu bab (STR-006). */
  min_chapter_words: number;
  subheading: { bold: boolean; capitalization: "title" | "sentence" | "any" };
  /** Spasi entri daftar pustaka (FMT-013). */
  reference_line_spacing: number;
  /** Subbab wajib per bab, misal { "BAB III": ["Teknik Analisis Data"] } (STR-007). Kosong: tidak diperiksa. */
  required_subsections: Record<string, string[]>;
  max_sentence_words: number;
  /** Kelompok kata kunci yang harus muncul di Bab III (STR-011). */
  methodology_keywords: { label: string; any: string[] }[];
  citation: { style: string; max_source_age_years: number; max_old_source_ratio: number };
  severity_weights: Record<Severity, number>;
  disabled_rules: string[];
};

export type Location = {
  paragraphIndex?: number | null;
  page?: number | null;
  headingPath?: string[];
  charStart?: number | null;
  charEnd?: number | null;
};

export type Issue = {
  category: IssueCategory;
  ruleCode: string;
  severity: Severity;
  message: string;
  suggestion?: string;
  /** Maksimal 300 karakter. */
  excerpt?: string;
  location?: Location;
};

export interface Checker {
  code: string;
  category: Category;
  defaultSeverity: Severity;
  run(doc: ParsedDocument, rules: Rules): Issue[];
}

// --- Dokumen hasil parse ----------------------------------------------------

export type Alignment = "left" | "center" | "right" | "justify";

export type ParsedRun = {
  text: string;
  italic: boolean;
  bold: boolean;
  fontName: string | null;
  fontSizePt: number | null;
};

export type ParsedParagraph = {
  index: number;
  text: string;
  styleName: string;
  sectionIndex: number;
  headingLevel: number | null;
  isChapterHeading: boolean;
  /** Baris daftar isi/gambar/tabel ("BAB I ..... 1"). Bukan judul sebenarnya. */
  isToc: boolean;
  alignment: Alignment | null;
  /** Kelipatan spasi (1,5; 2,0). Null bila spasi tetap (pt) atau tidak diketahui. */
  lineSpacing: number | null;
  firstLineIndentCm: number | null;
  hasDrawing: boolean;
  /** Lebar gambar terlebar di paragraf ini (cm), dari wp:extent. Null bila tidak ada gambar. */
  imageWidthCm: number | null;
  /** Gambar di paragraf ini tanpa teks alternatif (wp:docPr descr dan title kosong). */
  imageAltMissing: boolean;
  /** Paragraf memuat persamaan Word (m:oMath). */
  hasMath: boolean;
  /** Halaman perkiraan dari w:lastRenderedPageBreak. Null bila dokumen tidak punya penanda. */
  page: number | null;
  runs: ParsedRun[];
};

export type ParsedSection = {
  index: number;
  pageWidthCm: number;
  pageHeightCm: number;
  marginLeftCm: number;
  marginTopCm: number;
  marginRightCm: number;
  marginBottomCm: number;
  /** Nilai w:fmt pada w:pgNumType, misal "lowerRoman" atau "decimal". Null bila tidak diatur. */
  pageNumberFormat: string | null;
  pageNumberStart: number | null;
  hasPageNumberField: boolean;
  /** Header section ini berisi teks (bukan hanya kosong atau field). */
  hasHeaderText: boolean;
};

/** Urutan elemen tingkat atas, untuk memeriksa posisi caption terhadap tabel dan gambar. */
export type BodyElement = { kind: "p"; index: number } | { kind: "tbl" };

export type ParsedTable = {
  /** Posisi di `elements`. */
  elementIndex: number;
  rows: number;
  cols: number;
  /** Jumlah lebar kolom (cm); null bila grid tidak ada. */
  widthCm: number | null;
  hasHeaderRow: boolean;
  /** Jenis dan ukuran huruf yang paling banyak dipakai di isi tabel; null bila tabel tanpa teks. */
  fontName: string | null;
  fontSizePt: number | null;
};

export type ParsedMeta = {
  title: string | null;
  author: string | null;
  lastModifiedBy: string | null;
};

export type ParsedDocument = {
  paragraphs: ParsedParagraph[];
  tables: ParsedTable[];
  /** Perubahan terlacak (track changes) yang belum diterima atau ditolak. */
  revisions: number;
  commentCount: number;
  footnoteCount: number;
  /** Daftar isi memakai field TOC otomatis Word. */
  hasTocField: boolean;
  meta: ParsedMeta | null;
  sections: ParsedSection[];
  elements: BodyElement[];
  tableCount: number;
  wordCount: number;
  hasPageMarkers: boolean;
};

export function isHeading(p: ParsedParagraph): boolean {
  return p.headingLevel !== null || p.isChapterHeading;
}

/** Paragraf isi: bukan judul dan tidak kosong. */
export function bodyParagraphs(doc: ParsedDocument): ParsedParagraph[] {
  return doc.paragraphs.filter((p) => p.text.trim() !== "" && !isHeading(p));
}
