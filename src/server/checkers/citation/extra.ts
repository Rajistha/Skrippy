/** Aturan sitasi tambahan (gaya APA): penulis banyak, entri tanpa DOI/URL, kutipan langsung tanpa halaman. */
import { findSections } from "../structure/rules";
import type { Checker, Issue, ParsedDocument, ParsedParagraph } from "../types";

const MAX = 25;
const YEAR_BLOCK = /\((?:(?:19|20)\d{2}[a-z]?|t\.t\.|n\.d\.)\)/;
const AUTHOR = /\p{Lu}[\p{L}'’-]+,\s*(?:\p{Lu}\.[\s-]*)+/gu;
const NAME = "[A-ZÀ-Ý][\\p{L}'’\\-]+";
const ETAL = new RegExp(
  `(${NAME})\\s+(?:dkk\\.?|et al\\.?),?\\s+\\(?((?:19|20)\\d{2})[a-z]?`,
  "gu",
);

function entries(doc: ParsedDocument): ParsedParagraph[] {
  const start = findSections(doc, ["DAFTAR PUSTAKA"]).get("DAFTAR PUSTAKA");
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

function bodyBeforeBibliography(doc: ParsedDocument): ParsedParagraph[] {
  const start = findSections(doc, ["DAFTAR PUSTAKA"]).get("DAFTAR PUSTAKA");
  const limit = start ? start.index : doc.paragraphs.length;
  return doc.paragraphs.filter(
    (p) => p.index < limit && !p.isToc && p.headingLevel === null && !p.isChapterHeading,
  );
}

const authorCount = (entry: string): number => {
  const year = YEAR_BLOCK.exec(entry);
  const head = year ? entry.slice(0, year.index) : entry;
  return (head.match(AUTHOR) ?? []).length;
};

/** "Nama dkk." hanya untuk tiga penulis atau lebih; daftar pustaka dipakai sebagai pembanding. */
export const etAlUsage: Checker = {
  code: "SIT-008",
  category: "citation",
  defaultSeverity: "minor",
  run(doc, rules) {
    if (rules.citation.style.toLowerCase() !== "apa") return [];
    const authors = new Map<string, number>();
    for (const e of entries(doc)) {
      const m = /^\s*(\p{Lu}[\p{L}'’-]+),/u.exec(e.text);
      const year = /\(((?:19|20)\d{2})[a-z]?\)/.exec(e.text);
      if (m && year)
        authors.set(
          `${m[1]!.toLowerCase()}:${year[1]}`,
          /\b(dkk|et al)\b/i.test(e.text) ? 3 : authorCount(e.text),
        );
    }
    const issues: Issue[] = [];
    const seen = new Set<string>();
    for (const p of bodyBeforeBibliography(doc)) {
      for (const m of p.text.matchAll(ETAL)) {
        const key = `${m[1]!.toLowerCase()}:${m[2]}`;
        const n = authors.get(key);
        if (n === undefined || n >= 3 || seen.has(key)) continue;
        seen.add(key);
        issues.push({
          category: "citation",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `${m[1]} (${m[2]}) hanya punya ${n} penulis di daftar pustaka, tetapi disitasi dengan "dkk.".`,
          suggestion:
            "Tulis semua nama penulis, atau pakai dkk. hanya untuk tiga penulis atau lebih.",
          excerpt: m[0].slice(0, 120),
          location: { paragraphIndex: p.index, page: p.page },
        });
      }
    }
    return issues.slice(0, MAX);
  },
};

const IS_JOURNAL = /\b(jurnal|journal|vol\.|volume|proceeding|prosiding)\b/i;
const HAS_LINK = /\bdoi\b|https?:\/\//i;

export const missingDoi: Checker = {
  code: "SIT-010",
  category: "citation",
  defaultSeverity: "minor",
  run(doc) {
    const issues: Issue[] = [];
    for (const p of entries(doc)) {
      const text = p.text.trim();
      if (!IS_JOURNAL.test(text) || HAS_LINK.test(text)) continue;
      issues.push({
        category: "citation",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: "Artikel jurnal atau prosiding ini belum mencantumkan DOI atau URL.",
        suggestion: "Tambahkan DOI (https://doi.org/...) di akhir entri.",
        excerpt: text.slice(0, 120),
        location: { paragraphIndex: p.index, page: p.page },
      });
    }
    return issues.slice(0, MAX);
  },
};

const DIRECT_QUOTE = /["“]([^"”]{30,})["”]\s*\(([^()]*?(?:19|20)\d{2}[a-z]?[^()]*)\)/gu;
const PAGE = /\b(hlm|hal|h|p|pp)\.?\s*\d+/i;

export const quoteWithoutPage: Checker = {
  code: "SIT-011",
  category: "citation",
  defaultSeverity: "minor",
  run(doc) {
    const issues: Issue[] = [];
    for (const p of bodyBeforeBibliography(doc)) {
      for (const m of p.text.matchAll(DIRECT_QUOTE)) {
        if (PAGE.test(m[2]!)) continue;
        issues.push({
          category: "citation",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: "Kutipan langsung belum mencantumkan nomor halaman.",
          suggestion: "Tambahkan halaman, misalnya (Adams, 2020, hlm. 15).",
          excerpt: m[0].slice(0, 200),
          location: { paragraphIndex: p.index, page: p.page },
        });
      }
    }
    return issues.slice(0, MAX);
  },
};

export const citationExtraCheckers: Checker[] = [etAlUsage, missingDoi, quoteWithoutPage];

export type { Issue };
