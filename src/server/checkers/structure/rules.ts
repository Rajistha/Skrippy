import type { Checker, Issue, ParsedDocument, ParsedParagraph } from "../types";

const CHAPTER = /^\s*(BAB\s+[IVXLC]+)\b/i;
const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };

const norm = (text: string): string => text.trim().replace(/\s+/g, " ").toUpperCase();

export function romanToInt(roman: string): number {
  let total = 0;
  const s = roman.toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const cur = ROMAN[s[i]!] ?? 0;
    const next = ROMAN[s[i + 1] ?? ""] ?? 0;
    total += cur < next ? -cur : cur;
  }
  return total;
}

/**
 * Petakan nama bagian wajib ke paragraf judulnya. Baris daftar isi dilewati supaya
 * "BAB I ........ 1" di daftar isi tidak dianggap judul bab sebenarnya.
 */
export function findSections(
  doc: ParsedDocument,
  required: string[],
): Map<string, ParsedParagraph> {
  const found = new Map<string, ParsedParagraph>();
  for (const p of doc.paragraphs) {
    if (p.isToc) continue;
    const text = norm(p.text);
    if (!text || text.length > 80) continue;
    const chapter = CHAPTER.exec(text);
    const chapterKey = chapter ? norm(chapter[1]!) : null;
    for (const name of required) {
      if (found.has(name)) continue;
      const key = norm(name);
      if (text === key || (key.startsWith("BAB") && chapterKey === key)) found.set(name, p);
    }
  }
  return found;
}

/** "KATA PENGANTAR" -> "Kata Pengantar"; angka romawi setelah BAB tetap kapital ("Bab III"). */
const titleCase = (s: string): string =>
  s
    .split(/\s+/)
    .map((w, i, all) =>
      i > 0 && all[i - 1]!.toUpperCase() === "BAB" && /^[IVXLC]+$/i.test(w)
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");

export const requiredSections: Checker = {
  code: "STR-001",
  category: "structure",
  defaultSeverity: "critical",
  run(doc, rules) {
    const found = findSections(doc, rules.required_sections);
    const issues: Issue[] = [];
    for (const name of rules.required_sections) {
      if (found.has(name)) continue;
      // Halaman judul jarang diberi teks "HALAMAN JUDUL"; jangan buat temuan palsu.
      if (norm(name) === "HALAMAN JUDUL") continue;
      issues.push({
        category: "structure",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Bagian ${titleCase(name)} tidak ditemukan.`,
        suggestion: `Tambahkan bagian ${titleCase(name)} sesuai pedoman.`,
      });
    }
    return issues;
  },
};

export const sectionOrder: Checker = {
  code: "STR-002",
  category: "structure",
  defaultSeverity: "major",
  run(doc, rules) {
    const found = findSections(doc, rules.required_sections);
    const issues: Issue[] = [];
    let lastName = "";
    let lastIndex = -1;
    for (const name of rules.required_sections) {
      const p = found.get(name);
      if (!p) continue;
      if (p.index < lastIndex) {
        issues.push({
          category: "structure",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `${titleCase(name)} muncul sebelum ${titleCase(lastName)}.`,
          suggestion: "Urutkan bagian sesuai pedoman.",
          location: { paragraphIndex: p.index, page: p.page },
        });
      } else {
        lastName = name;
        lastIndex = p.index;
      }
    }
    return issues;
  },
};

export const tableOfContents: Checker = {
  code: "STR-003",
  category: "structure",
  defaultSeverity: "major",
  run(doc) {
    const tocLines = doc.paragraphs.filter((p) => p.isToc);
    if (tocLines.length === 0) return []; // daftar isi tidak ada/manual: STR-001 yang melapor

    const tocChapters = new Set<string>();
    for (const p of tocLines) {
      const m = CHAPTER.exec(norm(p.text));
      if (m) tocChapters.add(norm(m[1]!));
    }
    const issues: Issue[] = [];
    const bodyChapters = doc.paragraphs.filter((p) => p.isChapterHeading);
    const bodyKeys = new Set<string>();
    for (const p of bodyChapters) {
      const key = norm(CHAPTER.exec(norm(p.text))![1]!);
      bodyKeys.add(key);
      if (!tocChapters.has(key)) {
        issues.push({
          category: "structure",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `${titleCase(key)} ada di naskah tapi tidak ada di daftar isi.`,
          suggestion: "Perbarui daftar isi (klik kanan > Update Field).",
          excerpt: p.text.trim().slice(0, 120),
          location: { paragraphIndex: p.index, page: p.page },
        });
      }
    }
    for (const key of tocChapters) {
      if (!bodyKeys.has(key)) {
        issues.push({
          category: "structure",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `${titleCase(key)} ada di daftar isi tapi tidak ditemukan di naskah.`,
          suggestion: "Perbarui daftar isi atau periksa judul bab di naskah.",
        });
      }
    }
    return issues;
  },
};

const SUBHEADING = /^\s*(\d+)\.(\d+)(?:\.(\d+))?\s+\S/;

export const subsectionNumbering: Checker = {
  code: "STR-004",
  category: "structure",
  defaultSeverity: "major",
  run(doc) {
    const issues: Issue[] = [];
    let chapter = 0;
    let lastSub = 0;
    for (const p of doc.paragraphs) {
      if (p.isToc) continue;
      if (p.isChapterHeading) {
        const m = CHAPTER.exec(norm(p.text));
        chapter = m ? romanToInt(m[1]!.split(" ")[1]!) : 0;
        lastSub = 0;
        continue;
      }
      if (chapter === 0 || p.text.length > 150) continue;
      const m = SUBHEADING.exec(p.text);
      // Hanya baris yang bergaya judul (heading) atau pendek, agar kalimat berawalan angka tidak terhitung.
      if (!m || (p.headingLevel === null && p.text.trim().split(/\s+/).length > 14)) continue;
      const c = Number(m[1]);
      const s = Number(m[2]);
      const isLevel2 = m[3] === undefined;
      if (c !== chapter) {
        issues.push({
          category: "structure",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `Subbab ${c}.${s} berada di Bab ${chapter}, nomornya seharusnya ${chapter}.${s}.`,
          suggestion: `Samakan angka bab pada nomor subbab dengan bab ${chapter}.`,
          excerpt: p.text.trim().slice(0, 120),
          location: { paragraphIndex: p.index, page: p.page },
        });
      } else if (isLevel2) {
        if (s !== lastSub + 1 && s > lastSub) {
          issues.push({
            category: "structure",
            ruleCode: this.code,
            severity: this.defaultSeverity,
            message: `Subbab ${c}.${s} muncul setelah ${c}.${lastSub}, ada nomor yang terlewat.`,
            suggestion: "Periksa urutan nomor subbab.",
            excerpt: p.text.trim().slice(0, 120),
            location: { paragraphIndex: p.index, page: p.page },
          });
        }
        lastSub = Math.max(lastSub, s);
      }
    }
    return issues.slice(0, 25);
  },
};

export const abstractLength: Checker = {
  code: "STR-005",
  category: "structure",
  defaultSeverity: "minor",
  run(doc, rules) {
    const found = findSections(doc, ["ABSTRAK", "KATA PENGANTAR", "DAFTAR ISI", "BAB I"]);
    const start = found.get("ABSTRAK");
    if (!start) return [];
    const ends = ["KATA PENGANTAR", "DAFTAR ISI", "BAB I"]
      .map((n) => found.get(n))
      .filter((p): p is ParsedParagraph => !!p && p.index > start.index)
      .map((p) => p.index);
    const end = ends.length > 0 ? Math.min(...ends) : doc.paragraphs.length;
    let words = 0;
    for (const p of doc.paragraphs) {
      if (p.index <= start.index || p.index >= end) continue;
      if (/^(KATA KUNCI|KEYWORDS?|ABSTRACT)\b/.test(norm(p.text))) continue;
      words += p.text.trim().split(/\s+/).filter(Boolean).length;
    }
    const { min, max } = rules.abstract_words;
    if (words >= min && words <= max) return [];
    return [
      {
        category: "structure",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Abstrak ${words} kata, seharusnya ${min} sampai ${max} kata.`,
        suggestion: `Sesuaikan panjang abstrak menjadi ${min} sampai ${max} kata.`,
        location: { paragraphIndex: start.index, page: start.page, headingPath: ["Abstrak"] },
      },
    ];
  },
};

export const chapterLength: Checker = {
  code: "STR-006",
  category: "structure",
  defaultSeverity: "major",
  run(doc, rules) {
    const min = rules.min_chapter_words;
    const chapters = rules.required_sections.filter((n) => /^BAB\b/i.test(n));
    const found = findSections(doc, [...chapters, "DAFTAR PUSTAKA"]);
    const starts = [...found.values()].map((p) => p.index).sort((a, b) => a - b);
    const issues: Issue[] = [];
    for (const name of chapters) {
      const heading = found.get(name);
      if (!heading) continue; // bagian hilang dilaporkan STR-001
      const end = starts.find((i) => i > heading.index) ?? doc.paragraphs.length;
      let words = 0;
      for (const p of doc.paragraphs) {
        if (p.index <= heading.index || p.index >= end || p.isToc) continue;
        words += p.text.trim().split(/\s+/).filter(Boolean).length;
      }
      if (words >= min) continue;
      const label = titleCase(name);
      issues.push({
        category: "structure",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message:
          words === 0
            ? `${label} belum ada isinya.`
            : `${label} hanya ${words} kata, seharusnya minimal ${min} kata.`,
        suggestion: `Lengkapi isi ${label}.`,
        location: { paragraphIndex: heading.index, page: heading.page, headingPath: [label] },
      });
    }
    return issues;
  },
};

export const structureCheckers: Checker[] = [
  requiredSections,
  sectionOrder,
  tableOfContents,
  subsectionNumbering,
  abstractLength,
  chapterLength,
];
