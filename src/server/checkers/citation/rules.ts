/** Aturan sitasi gaya APA (nama, tahun). */
import { findSections } from "../structure/rules";
import type { Checker, Issue, ParsedDocument, ParsedParagraph } from "../types";

const NAME = "[A-ZÀ-Ý][\\p{L}'’\\-]+";
// (Nama, 2020) (Nama & Lain, 2020) (Nama dkk., 2020) (Nama, 2020a; Lain, 2019)
const PAREN = /\(([^()]*?\b(?:19|20)\d{2}[a-z]?[^()]*?)\)/gu;
const ITEM = new RegExp(
  `(${NAME})(?:\\s+(?:&|dan|and)\\s+${NAME}|\\s+dkk\\.?|\\s+et al\\.?)?,?\\s+((?:19|20)\\d{2})[a-z]?`,
  "u",
);
// Nama (2020): sitasi naratif
const NARRATIVE = new RegExp(
  `(${NAME})(?:\\s+(?:&|dan|and)\\s+${NAME}|\\s+dkk\\.?|\\s+et al\\.?)?\\s+\\(((?:19|20)\\d{2})[a-z]?\\)`,
  "gu",
);
const ENTRY = new RegExp(`^\\s*(${NAME}),.*?\\(((?:19|20)\\d{2})[a-z]?\\)`, "u");
const MAX = 25;

type Citation = { surname: string; year: number; paragraph: ParsedParagraph; text: string };
type Reference = { surname: string; year: number; paragraph: ParsedParagraph };

function bibliographyStart(doc: ParsedDocument): ParsedParagraph | undefined {
  return findSections(doc, ["DAFTAR PUSTAKA"]).get("DAFTAR PUSTAKA");
}

function bibliography(doc: ParsedDocument): Reference[] {
  const start = bibliographyStart(doc);
  if (!start) return [];
  const refs: Reference[] = [];
  for (const p of doc.paragraphs) {
    if (p.index <= start.index || p.isToc) continue;
    if (p.headingLevel !== null || p.isChapterHeading) continue;
    const m = ENTRY.exec(p.text);
    if (m) refs.push({ surname: m[1]!, year: Number(m[2]), paragraph: p });
  }
  return refs;
}

function citations(doc: ParsedDocument): Citation[] {
  const start = bibliographyStart(doc);
  const limit = start ? start.index : doc.paragraphs.length;
  const found: Citation[] = [];
  for (const p of doc.paragraphs) {
    if (p.index >= limit || p.isToc || p.headingLevel !== null || p.isChapterHeading) continue;
    for (const block of p.text.matchAll(PAREN)) {
      for (const item of block[1]!.split(";")) {
        const m = ITEM.exec(item.trim());
        if (m) found.push({ surname: m[1]!, year: Number(m[2]), paragraph: p, text: block[0] });
      }
    }
    for (const m of p.text.matchAll(NARRATIVE)) {
      found.push({ surname: m[1]!, year: Number(m[2]), paragraph: p, text: m[0] });
    }
  }
  return found;
}

const key = (surname: string): string => surname.toLowerCase();

export const missingReference: Checker = {
  code: "SIT-001",
  category: "citation",
  defaultSeverity: "critical",
  run(doc) {
    const refs = bibliography(doc);
    if (refs.length === 0) return []; // tanpa daftar pustaka terbaca, STR-001 yang melapor
    const byName = new Map<string, Set<number>>();
    for (const r of refs)
      byName.set(key(r.surname), (byName.get(key(r.surname)) ?? new Set()).add(r.year));
    const issues: Issue[] = [];
    const seen = new Set<string>();
    for (const c of citations(doc)) {
      const id = `${key(c.surname)}:${c.year}`;
      if (seen.has(id) || byName.has(key(c.surname))) continue; // nama ada tapi tahun beda: SIT-004
      seen.add(id);
      issues.push({
        category: "citation",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Sitasi ${c.surname} (${c.year}) tidak ada di daftar pustaka.`,
        suggestion: "Tambahkan sumber ke daftar pustaka atau hapus sitasinya.",
        excerpt: c.text.slice(0, 120),
        location: { paragraphIndex: c.paragraph.index, page: c.paragraph.page },
      });
    }
    return issues.slice(0, MAX);
  },
};

export const uncitedReference: Checker = {
  code: "SIT-002",
  category: "citation",
  defaultSeverity: "major",
  run(doc) {
    const cites = citations(doc);
    const names = new Set(cites.map((c) => key(c.surname)));
    const issues: Issue[] = [];
    for (const r of bibliography(doc)) {
      if (names.has(key(r.surname))) continue; // disitasi (tahun berbeda dilaporkan SIT-004)
      issues.push({
        category: "citation",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `${r.surname} (${r.year}) ada di daftar pustaka tapi tidak disitasi.`,
        suggestion: "Sitasi sumber ini di naskah atau hapus dari daftar pustaka.",
        excerpt: r.paragraph.text.trim().slice(0, 120),
        location: { paragraphIndex: r.paragraph.index, page: r.paragraph.page },
      });
    }
    return issues.slice(0, MAX);
  },
};

export const bibliographyOrder: Checker = {
  code: "SIT-003",
  category: "citation",
  defaultSeverity: "major",
  run(doc) {
    const refs = bibliography(doc);
    const issues: Issue[] = [];
    for (let i = 1; i < refs.length; i++) {
      const prev = refs[i - 1]!;
      const cur = refs[i]!;
      if (key(cur.surname) < key(prev.surname)) {
        issues.push({
          category: "citation",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `${cur.surname} muncul setelah ${prev.surname}, urutan belum alfabet.`,
          suggestion: "Urutkan daftar pustaka secara alfabet.",
          excerpt: cur.paragraph.text.trim().slice(0, 120),
          location: { paragraphIndex: cur.paragraph.index, page: cur.paragraph.page },
        });
      }
    }
    return issues.slice(0, MAX);
  },
};

export const yearMismatch: Checker = {
  code: "SIT-004",
  category: "citation",
  defaultSeverity: "major",
  run(doc) {
    const byName = new Map<string, Set<number>>();
    for (const r of bibliography(doc))
      byName.set(key(r.surname), (byName.get(key(r.surname)) ?? new Set()).add(r.year));
    const issues: Issue[] = [];
    const seen = new Set<string>();
    for (const c of citations(doc)) {
      const years = byName.get(key(c.surname));
      const id = `${key(c.surname)}:${c.year}`;
      if (!years || years.has(c.year) || seen.has(id)) continue;
      seen.add(id);
      issues.push({
        category: "citation",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Tahun sitasi ${c.surname} ${c.year}, di daftar pustaka ${[...years].sort().join(", ")}.`,
        suggestion: "Samakan tahun di teks dengan daftar pustaka.",
        excerpt: c.text.slice(0, 120),
        location: { paragraphIndex: c.paragraph.index, page: c.paragraph.page },
      });
    }
    return issues.slice(0, MAX);
  },
};

export const oldSources: Checker = {
  code: "SIT-005",
  category: "citation",
  defaultSeverity: "minor",
  run(doc, rules) {
    const refs = bibliography(doc);
    if (refs.length < 5) return [];
    const { max_source_age_years: maxAge, max_old_source_ratio: limit } = rules.citation;
    const thisYear = new Date().getUTCFullYear();
    const old = refs.filter((r) => thisYear - r.year > maxAge).length;
    const ratio = old / refs.length;
    if (ratio <= limit) return [];
    return [
      {
        category: "citation",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `${Math.round(ratio * 100)}% sumber berumur lebih dari ${maxAge} tahun, seharusnya maksimal ${Math.round(limit * 100)}%.`,
        suggestion: "Tambahkan sumber yang lebih baru.",
      },
    ];
  },
};

/** Paragraf entri daftar pustaka: semua paragraf isi sesudah judul "DAFTAR PUSTAKA". */
function bibliographyEntries(doc: ParsedDocument): ParsedParagraph[] {
  const start = bibliographyStart(doc);
  if (!start) return [];
  return doc.paragraphs.filter(
    (p) =>
      p.index > start.index &&
      !p.isToc &&
      p.headingLevel === null &&
      !p.isChapterHeading &&
      p.text.trim() !== "",
  );
}

const YEAR_BLOCK = /\((?:(?:19|20)\d{2}[a-z]?|t\.t\.|n\.d\.)\)/;
const INITIALS_AFTER_COMMA = /^[^,()]+,\s*(?:\p{Lu}\.[\s-]*)+/u;

export const referenceFormat: Checker = {
  code: "SIT-006",
  category: "citation",
  defaultSeverity: "minor",
  run(doc, rules) {
    if (rules.citation.style.toLowerCase() !== "apa") return [];
    const issues: Issue[] = [];
    for (const p of bibliographyEntries(doc)) {
      const text = p.text.trim();
      const year = YEAR_BLOCK.exec(text);
      let message: string | null = null;
      let suggestion = "";
      if (!year) {
        message = "Entri daftar pustaka tidak memuat tahun dalam kurung, misalnya (2020).";
        suggestion = "Tulis tahun terbit dalam kurung setelah nama penulis: Nama, A. (2020).";
      } else if (text.slice(year.index + year[0].length).trim() === "") {
        message = "Entri daftar pustaka berhenti setelah tahun, judul dan penerbit belum ada.";
        suggestion = "Lengkapi judul dan penerbit setelah tahun.";
      } else if (!text.slice(year.index + year[0].length).startsWith(".")) {
        message = "Tahun dalam entri daftar pustaka harus diikuti titik: (2020).";
        suggestion = "Tambahkan titik setelah kurung tahun.";
      } else {
        const authors = text.slice(0, year.index);
        if (authors.includes(",") && !INITIALS_AFTER_COMMA.test(authors)) {
          message = "Nama penulis tidak ditulis dengan pola Nama belakang, Inisial.";
          suggestion = "Tulis dengan pola APA: Adams, B.";
        }
      }
      if (!message) continue;
      issues.push({
        category: "citation",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message,
        suggestion,
        excerpt: text.slice(0, 120),
        location: { paragraphIndex: p.index, page: p.page },
      });
    }
    return issues.slice(0, MAX);
  },
};

const NUMERIC_CITE = /\[\d+(?:\s*[,–-]\s*\d+)*\]/g;

export const citationStyleMix: Checker = {
  code: "SIT-007",
  category: "citation",
  defaultSeverity: "major",
  run(doc) {
    const author = citations(doc);
    const start = bibliographyStart(doc);
    const limit = start ? start.index : doc.paragraphs.length;
    const numeric: { paragraph: ParsedParagraph; text: string }[] = [];
    for (const p of doc.paragraphs) {
      if (p.index >= limit || p.isToc || p.headingLevel !== null || p.isChapterHeading) continue;
      for (const m of p.text.matchAll(NUMERIC_CITE)) numeric.push({ paragraph: p, text: m[0] });
    }
    if (author.length === 0 || numeric.length === 0) return [];
    const minorityIsNumeric = numeric.length <= author.length;
    const first = minorityIsNumeric ? numeric[0]! : author[0]!;
    return [
      {
        category: "citation",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Gaya sitasi tercampur: ${author.length} sitasi nama-tahun dan ${numeric.length} sitasi bernomor.`,
        suggestion: minorityIsNumeric
          ? "Ubah sitasi bernomor menjadi gaya nama-tahun, misalnya (Adams, 2020)."
          : "Ubah sitasi nama-tahun menjadi sitasi bernomor.",
        excerpt: first.text.slice(0, 120),
        location: { paragraphIndex: first.paragraph.index, page: first.paragraph.page },
      },
    ];
  },
};

const entryKey = (text: string): string => {
  const year = YEAR_BLOCK.exec(text);
  if (!year) return "";
  const authors = text
    .slice(0, year.index)
    .toLowerCase()
    .replace(/[^\p{L}]/gu, "");
  const afterYear = text.slice(year.index + year[0].length).replace(/^\s*\.\s*/, "");
  const title = (afterYear.split(/\.\s/)[0] ?? "").toLowerCase().replace(/[^\p{L}\d]/gu, "");
  return `${authors}|${year[0]}|${title}`;
};

export const duplicateReference: Checker = {
  code: "SIT-009",
  category: "citation",
  defaultSeverity: "minor",
  run(doc) {
    const seen = new Map<string, ParsedParagraph>();
    const issues: Issue[] = [];
    for (const p of bibliographyEntries(doc)) {
      const key = entryKey(p.text.trim());
      if (!key || key.endsWith("|")) continue;
      if (seen.has(key)) {
        issues.push({
          category: "citation",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: "Entri daftar pustaka ini sama dengan entri sebelumnya.",
          suggestion: "Hapus salah satu entri yang sama.",
          excerpt: p.text.trim().slice(0, 120),
          location: { paragraphIndex: p.index, page: p.page },
        });
      } else seen.set(key, p);
    }
    return issues.slice(0, MAX);
  },
};

export const citationCheckers: Checker[] = [
  missingReference,
  uncitedReference,
  bibliographyOrder,
  yearMismatch,
  oldSources,
  referenceFormat,
  citationStyleMix,
  duplicateReference,
];
