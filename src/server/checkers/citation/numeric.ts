/**
 * Aturan sitasi bernomor (IEEE, Vancouver) dan ketelitian entri APA yang berpenulis dan bertahun sama.
 * Aturan bernomor hanya berjalan bila gaya pedoman bernomor atau naskah memang memakai [1], [2].
 */
import { findSections } from "../structure/rules";
import type { Checker, Issue, ParsedDocument, ParsedParagraph, Rules } from "../types";

const MAX = 25;
const NUMERIC_CITE = /\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g;
const NUMBERED_STYLES = new Set(["ieee", "vancouver", "numeric", "nomor", "bernomor"]);
const ENTRY_NUMBER = /^\s*(?:\[(\d{1,3})\]|(\d{1,3})[.)])\s+\S/;
const AUTHOR_YEAR = /\(\s*[A-ZÀ-Ý][\p{L}'’-]+[^()]*?(?:19|20)\d{2}[a-z]?\s*\)/u;

type NumericCite = { n: number; paragraph: ParsedParagraph; text: string };
type NumberedEntry = { n: number; paragraph: ParsedParagraph };

/** "[1, 3-5]" -> 1, 3, 4, 5. Rentang dibatasi agar teks aneh tidak menghasilkan ribuan angka. */
function expand(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(",")) {
    const [a, b] = part.split(/[–-]/).map((x) => Number(x.trim()));
    if (a === undefined || Number.isNaN(a)) continue;
    const end = b !== undefined && !Number.isNaN(b) && b >= a && b - a <= 50 ? b : a;
    for (let k = a; k <= end; k++) out.push(k);
  }
  return out;
}

function bibliographyStart(doc: ParsedDocument): ParsedParagraph | undefined {
  return findSections(doc, ["DAFTAR PUSTAKA"]).get("DAFTAR PUSTAKA");
}

function bodyLimit(doc: ParsedDocument): number {
  return bibliographyStart(doc)?.index ?? doc.paragraphs.length;
}

function numericCitations(doc: ParsedDocument): NumericCite[] {
  const limit = bodyLimit(doc);
  const found: NumericCite[] = [];
  for (const p of doc.paragraphs) {
    if (p.index >= limit || p.isToc || p.headingLevel !== null || p.isChapterHeading) continue;
    for (const m of p.text.matchAll(NUMERIC_CITE))
      for (const n of expand(m[1]!)) found.push({ n, paragraph: p, text: m[0] });
  }
  return found;
}

function bibliographyParagraphs(doc: ParsedDocument): ParsedParagraph[] {
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

function numberedEntries(doc: ParsedDocument): NumberedEntry[] {
  const out: NumberedEntry[] = [];
  for (const p of bibliographyParagraphs(doc)) {
    const m = ENTRY_NUMBER.exec(p.text);
    if (m) out.push({ n: Number(m[1] ?? m[2]), paragraph: p });
  }
  return out;
}

/** Bernomor bila pedoman menyebutnya, atau bila naskah memuat lebih banyak [n] daripada (Nama, tahun). */
function usesNumericStyle(doc: ParsedDocument, rules: Rules, cites: NumericCite[]): boolean {
  if (NUMBERED_STYLES.has(rules.citation.style.toLowerCase())) return true;
  if (cites.length === 0) return false;
  const limit = bodyLimit(doc);
  let authorYear = 0;
  for (const p of doc.paragraphs) {
    if (p.index >= limit || p.isToc) continue;
    authorYear += (p.text.match(new RegExp(AUTHOR_YEAR.source, "gu")) ?? []).length;
  }
  return cites.length > authorYear;
}

export const numericMissingReference: Checker = {
  code: "SIT-012",
  category: "citation",
  defaultSeverity: "critical",
  run(doc, rules) {
    const cites = numericCitations(doc);
    if (!usesNumericStyle(doc, rules, cites)) return [];
    const entries = numberedEntries(doc);
    if (entries.length === 0) return []; // daftar pustaka tidak terbaca: STR-001 yang melapor
    const have = new Set(entries.map((e) => e.n));
    const issues: Issue[] = [];
    const seen = new Set<number>();
    for (const c of cites) {
      if (have.has(c.n) || seen.has(c.n)) continue;
      seen.add(c.n);
      issues.push({
        category: "citation",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Sitasi [${c.n}] tidak punya entri bernomor ${c.n} di daftar pustaka.`,
        suggestion: "Tambahkan sumbernya ke daftar pustaka atau perbaiki nomor sitasinya.",
        excerpt: c.text,
        location: { paragraphIndex: c.paragraph.index, page: c.paragraph.page },
      });
    }
    return issues.slice(0, MAX);
  },
};

export const numericUncitedReference: Checker = {
  code: "SIT-013",
  category: "citation",
  defaultSeverity: "major",
  run(doc, rules) {
    const cites = numericCitations(doc);
    if (!usesNumericStyle(doc, rules, cites)) return [];
    const entries = numberedEntries(doc);
    if (entries.length === 0 || cites.length === 0) return [];
    const cited = new Set(cites.map((c) => c.n));
    const issues: Issue[] = [];
    for (const e of entries) {
      if (cited.has(e.n)) continue;
      issues.push({
        category: "citation",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Entri [${e.n}] ada di daftar pustaka tetapi tidak pernah disitasi.`,
        suggestion: "Sitasi sumber ini di naskah atau hapus dari daftar pustaka.",
        excerpt: e.paragraph.text.trim().slice(0, 120),
        location: { paragraphIndex: e.paragraph.index, page: e.paragraph.page },
      });
    }
    return issues.slice(0, MAX);
  },
};

/** IEEE: entri bernomor 1..n tanpa lompatan, dan nomor pertama kali disitasi berurutan naik. */
export const numericOrder: Checker = {
  code: "SIT-014",
  category: "citation",
  defaultSeverity: "major",
  run(doc, rules) {
    const cites = numericCitations(doc);
    if (!usesNumericStyle(doc, rules, cites)) return [];
    const issues: Issue[] = [];
    const entries = numberedEntries(doc);
    entries.forEach((e, i) => {
      if (e.n === i + 1) return;
      issues.push({
        category: "citation",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Entri bernomor ${e.n} muncul di urutan ke-${i + 1}, nomor daftar pustaka belum berurutan.`,
        suggestion: "Nomori ulang entri secara berurutan: [1], [2], [3], dan seterusnya.",
        excerpt: e.paragraph.text.trim().slice(0, 120),
        location: { paragraphIndex: e.paragraph.index, page: e.paragraph.page },
      });
    });
    // Urutan kemunculan pertama: [1] sebelum [2] sebelum [3] ...
    const firstSeen: NumericCite[] = [];
    const seen = new Set<number>();
    for (const c of cites)
      if (!seen.has(c.n)) {
        seen.add(c.n);
        firstSeen.push(c);
      }
    let highest = 0;
    for (const c of firstSeen) {
      if (c.n < highest) {
        issues.push({
          category: "citation",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `Sitasi [${c.n}] pertama kali muncul setelah [${highest}], urutan sitasi belum sesuai gaya bernomor.`,
          suggestion: "Nomori sumber menurut urutan pertama kali disitasi di naskah.",
          excerpt: c.text,
          location: { paragraphIndex: c.paragraph.index, page: c.paragraph.page },
        });
        break; // satu temuan cukup; sisanya biasanya akibat yang sama
      }
      highest = Math.max(highest, c.n);
    }
    return issues.slice(0, MAX);
  },
};

const YEAR = /\(((?:19|20)\d{2})([a-z]?)\)/;
const SURNAME = /^\s*(\p{Lu}[\p{L}'’-]+),/u;

/** APA: dua sumber penulis pertama dan tahun sama harus dibedakan 2020a dan 2020b. */
export const sameAuthorYearSuffix: Checker = {
  code: "SIT-015",
  category: "citation",
  defaultSeverity: "minor",
  run(doc, rules) {
    if (rules.citation.style.toLowerCase() !== "apa") return [];
    const groups = new Map<string, { suffix: string; paragraph: ParsedParagraph }[]>();
    for (const p of bibliographyParagraphs(doc)) {
      const name = SURNAME.exec(p.text);
      const year = YEAR.exec(p.text);
      if (!name || !year) continue;
      const key = `${name[1]!.toLowerCase()}:${year[1]}`;
      groups.set(key, [...(groups.get(key) ?? []), { suffix: year[2]!, paragraph: p }]);
    }
    const issues: Issue[] = [];
    for (const [key, list] of groups) {
      if (list.length < 2) continue;
      const bare = list.filter((x) => x.suffix === "");
      if (bare.length === 0) continue;
      const [surname, year] = key.split(":");
      const first = bare[0]!;
      issues.push({
        category: "citation",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `${surname!.charAt(0).toUpperCase()}${surname!.slice(1)} punya ${list.length} sumber di tahun ${year}, tahunnya belum dibedakan dengan huruf.`,
        suggestion: `Tulis (${year}a), (${year}b), dan seterusnya di daftar pustaka dan di sitasi.`,
        excerpt: first.paragraph.text.trim().slice(0, 120),
        location: { paragraphIndex: first.paragraph.index, page: first.paragraph.page },
      });
    }
    return issues.slice(0, MAX);
  },
};

export const numericCheckers: Checker[] = [
  numericMissingReference,
  numericUncitedReference,
  numericOrder,
  sameAuthorYearSuffix,
];
