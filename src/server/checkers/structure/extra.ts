/** Aturan struktur tambahan: subbab wajib, daftar tabel/gambar, subbab kosong, daftar isi, metodologi, kemiripan. */
import { captions, isSubheading } from "../format/extra";
import type { Checker, Issue, ParsedDocument, ParsedParagraph } from "../types";
import { bodyParagraphs, isHeading } from "../types";
import { findSections } from "./rules";

const MAX_PER_RULE = 25;
const words = (text: string): string[] => text.toLowerCase().match(/[\p{L}\d]+/gu) ?? [];

type Range = { name: string; heading: ParsedParagraph; start: number; end: number };

/** Rentang paragraf tiap bab yang ada, dari judul bab sampai judul bagian berikutnya. */
export function chapterRanges(doc: ParsedDocument, requiredSections: string[]): Range[] {
  const chapters = requiredSections.filter((n) => /^BAB\b/i.test(n));
  const found = findSections(doc, [...requiredSections]);
  const starts = [...found.values()].map((p) => p.index).sort((a, b) => a - b);
  const out: Range[] = [];
  for (const name of chapters) {
    const heading = found.get(name);
    if (!heading) continue;
    const end = starts.find((i) => i > heading.index) ?? doc.paragraphs.length;
    out.push({ name, heading, start: heading.index + 1, end });
  }
  return out;
}

const inRange = (doc: ParsedDocument, r: Range): ParsedParagraph[] =>
  doc.paragraphs.filter((p) => p.index >= r.start && p.index < r.end && !p.isToc);

const titleCase = (s: string): string => s.replace(/^BAB/i, "Bab");

export const requiredSubsections: Checker = {
  code: "STR-007",
  category: "structure",
  defaultSeverity: "major",
  run(doc, rules) {
    const wanted = rules.required_subsections;
    const issues: Issue[] = [];
    for (const r of chapterRanges(doc, rules.required_sections)) {
      const list = wanted[r.name] ?? [];
      if (list.length === 0) continue;
      const headings = inRange(doc, r)
        .filter((p) => isSubheading(p) || isHeading(p))
        .map((p) => p.text.toLowerCase());
      for (const sub of list) {
        if (headings.some((h) => h.includes(sub.toLowerCase()))) continue;
        issues.push({
          category: "structure",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `${titleCase(r.name)} belum memuat subbab "${sub}".`,
          suggestion: `Tambahkan subbab "${sub}" di ${titleCase(r.name)}.`,
          location: { paragraphIndex: r.heading.index, page: r.heading.page },
        });
      }
    }
    return issues;
  },
};

/** Entri daftar tabel/gambar: baris daftar isi berurutan tepat setelah judul daftar. */
function listEntries(doc: ParsedDocument, heading: ParsedParagraph): number {
  let n = 0;
  for (const p of doc.paragraphs) {
    if (p.index <= heading.index) continue;
    if (p.text.trim() === "") continue;
    if (!p.isToc) break;
    n++;
  }
  return n;
}

export const captionLists: Checker = {
  code: "STR-008",
  category: "structure",
  defaultSeverity: "minor",
  run(doc) {
    const found = findSections(doc, ["DAFTAR TABEL", "DAFTAR GAMBAR"]);
    const caps = captions(doc);
    const issues: Issue[] = [];
    for (const [name, kind] of [
      ["DAFTAR TABEL", "Tabel"],
      ["DAFTAR GAMBAR", "Gambar"],
    ] as const) {
      const heading = found.get(name);
      if (!heading) continue;
      const entries = listEntries(doc, heading);
      if (entries === 0) continue; // daftar otomatis atau tidak terbaca
      const actual = caps.filter((c) => c.kind === kind).length;
      if (entries === actual) continue;
      issues.push({
        category: "structure",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `${name[0]}${name.slice(1).toLowerCase()} memuat ${entries} entri, naskah punya ${actual} ${kind.toLowerCase()} bercaption.`,
        suggestion: `Perbarui ${name.toLowerCase()} agar sesuai dengan caption di naskah.`,
        location: { paragraphIndex: heading.index, page: heading.page },
      });
    }
    return issues;
  },
};

const depth = (p: ParsedParagraph): number => {
  const m = /^\s*(\d+(?:\.\d+)+)/.exec(p.text);
  return m ? m[1]!.split(".").length : (p.headingLevel ?? 1);
};

export const emptySubsection: Checker = {
  code: "STR-009",
  category: "structure",
  defaultSeverity: "minor",
  run(doc) {
    const issues: Issue[] = [];
    const list = doc.paragraphs.filter((p) => p.text.trim() !== "" && !p.isToc);
    for (let i = 0; i < list.length - 1; i++) {
      const cur = list[i]!;
      const next = list[i + 1]!;
      if (!isSubheading(cur) || !isSubheading(next) || cur.hasDrawing) continue;
      if (depth(next) > depth(cur)) continue; // 2.1 lalu 2.1.1 lazim
      issues.push({
        category: "structure",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Subbab "${cur.text.trim().slice(0, 60)}" belum ada isinya.`,
        suggestion: "Isi subbab ini atau hapus judulnya.",
        excerpt: cur.text.trim().slice(0, 120),
        location: { paragraphIndex: cur.index, page: cur.page },
      });
    }
    return issues.slice(0, MAX_PER_RULE);
  },
};

export const manualTableOfContents: Checker = {
  code: "STR-010",
  category: "structure",
  defaultSeverity: "minor",
  run(doc) {
    const heading = findSections(doc, ["DAFTAR ISI"]).get("DAFTAR ISI");
    if (!heading || doc.hasTocField) return [];
    if (!doc.paragraphs.some((p) => p.isToc && p.index > heading.index)) return [];
    return [
      {
        category: "structure",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: "Daftar isi diketik manual, bukan dari fitur Daftar Isi otomatis Word.",
        suggestion: "Pakai References > Table of Contents agar nomor halaman selalu mutakhir.",
        location: { paragraphIndex: heading.index, page: heading.page },
      },
    ];
  },
};

export const methodologyCoverage: Checker = {
  code: "STR-011",
  category: "structure",
  defaultSeverity: "minor",
  run(doc, rules) {
    const groups = rules.methodology_keywords;
    if (groups.length === 0) return [];
    const method = chapterRanges(doc, rules.required_sections).find((r) =>
      /^BAB\s+III$/i.test(r.name),
    );
    if (!method) return [];
    const text = inRange(doc, method)
      .map((p) => p.text.toLowerCase())
      .join(" ");
    if (words(text).length < 50) return []; // bab terlalu pendek sudah dilaporkan STR-006
    const issues: Issue[] = [];
    for (const g of groups) {
      if (g.any.some((k) => text.includes(k.toLowerCase()))) continue;
      issues.push({
        category: "structure",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Bab III tidak menyebut ${g.label.toLowerCase()}.`,
        suggestion: `Jelaskan ${g.label.toLowerCase()} di Bab III.`,
        location: { paragraphIndex: method.heading.index, page: method.heading.page },
      });
    }
    return issues;
  },
};

const STOP = new Set([
  "yang",
  "dengan",
  "untuk",
  "pada",
  "dalam",
  "apakah",
  "bagaimana",
  "terhadap",
  "adalah",
  "dari",
  "atau",
  "serta",
  "antara",
  "tersebut",
  "penelitian",
  "mempengaruhi",
  "pengaruh",
]);
const keywords = (text: string): string[] => [
  ...new Set(words(text).filter((w) => w.length >= 5 && !STOP.has(w))),
];

/** Heuristik: tiap rumusan masalah (kalimat tanya di Bab I) harus punya jejak kata kunci di Bab IV atau V. */
export const problemTrace: Checker = {
  code: "STR-012",
  category: "structure",
  defaultSeverity: "minor",
  run(doc, rules) {
    const ranges = chapterRanges(doc, rules.required_sections);
    const one = ranges.find((r) => /^BAB\s+I$/i.test(r.name));
    const later = ranges.filter((r) => /^BAB\s+(IV|V)$/i.test(r.name));
    if (!one || later.length === 0) return [];
    const resultText = later
      .flatMap((r) => inRange(doc, r))
      .map((p) => p.text.toLowerCase())
      .join(" ");
    if (words(resultText).length < 100) return [];
    const issues: Issue[] = [];
    for (const p of inRange(doc, one)) {
      for (const sentence of p.text.split(/(?<=[?])\s+/)) {
        if (!sentence.trim().endsWith("?") || sentence.length < 25) continue;
        const keys = keywords(sentence);
        if (keys.length < 3) continue;
        const hit = keys.filter((k) => resultText.includes(k)).length;
        if (hit / keys.length >= 0.4) continue;
        issues.push({
          category: "structure",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: "Rumusan masalah ini tidak terlihat dibahas di Bab IV atau Bab V.",
          suggestion: "Pastikan tiap rumusan masalah dijawab di pembahasan dan kesimpulan.",
          excerpt: sentence.trim().slice(0, 200),
          location: { paragraphIndex: p.index, page: p.page },
        });
      }
    }
    return issues.slice(0, MAX_PER_RULE);
  },
};

const SHINGLE = 8;
const MIN_WORDS = 25;

/** Paragraf yang hampir sama persis dengan paragraf lain di naskah yang sama (indikasi salin-tempel). */
export const internalDuplicate: Checker = {
  code: "STR-013",
  category: "structure",
  defaultSeverity: "major",
  run(doc) {
    const paragraphs = bodyParagraphs(doc).filter((p) => words(p.text).length >= MIN_WORDS);
    const owners = new Map<string, number>();
    const shingles: Set<string>[] = [];
    for (const p of paragraphs) {
      const w = words(p.text);
      const set = new Set<string>();
      for (let k = 0; k + SHINGLE <= w.length; k++) set.add(w.slice(k, k + SHINGLE).join(" "));
      shingles.push(set);
    }
    const issues: Issue[] = [];
    const reported = new Set<number>();
    paragraphs.forEach((p, i) => {
      const own = shingles[i]!;
      const shared = new Map<number, number>();
      for (const s of own) {
        const first = owners.get(s);
        if (first !== undefined) shared.set(first, (shared.get(first) ?? 0) + 1);
        else owners.set(s, i);
      }
      for (const [other, n] of shared) {
        const ratio = n / Math.min(own.size, shingles[other]!.size);
        if (ratio < 0.6 || reported.has(i)) continue;
        reported.add(i);
        issues.push({
          category: "structure",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `Paragraf ini ${Math.round(ratio * 100)}% sama dengan paragraf lain di naskah.`,
          suggestion: "Tulis ulang, atau hapus bila terduplikasi tanpa sengaja.",
          excerpt: p.text.trim().slice(0, 200),
          location: { paragraphIndex: p.index, page: p.page },
        });
      }
    });
    return issues.slice(0, MAX_PER_RULE);
  },
};

export const structureExtraCheckers: Checker[] = [
  requiredSubsections,
  captionLists,
  emptySubsection,
  manualTableOfContents,
  methodologyCoverage,
  problemTrace,
  internalDuplicate,
];
