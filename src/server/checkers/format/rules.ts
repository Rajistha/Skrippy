import type { Checker, Issue, ParsedDocument, ParsedParagraph } from "../types";
import { bodyParagraphs } from "../types";

const PAPER_CM: Record<string, [number, number]> = {
  A4: [21.0, 29.7],
  LETTER: [21.59, 27.94],
  A5: [14.8, 21.0],
};

const MAX_PER_RULE = 25;

/** Angka gaya Indonesia: 1,5 bukan 1.5. */
export function num(value: number): string {
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

function excerptOf(p: ParsedParagraph): string {
  return p.text.trim().slice(0, 120);
}

function dominant<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function cap(issues: Issue[]): Issue[] {
  return issues.slice(0, MAX_PER_RULE);
}

export const paperSize: Checker = {
  code: "FMT-001",
  category: "format",
  defaultSeverity: "critical",
  run(doc, rules) {
    const expected = rules.page.size.toUpperCase();
    const [w, h] = PAPER_CM[expected] ?? PAPER_CM.A4!;
    const tol = 0.2;
    for (const s of doc.sections) {
      if (Math.abs(s.pageWidthCm - w) > tol || Math.abs(s.pageHeightCm - h) > tol) {
        return [
          {
            category: "format",
            ruleCode: this.code,
            severity: this.defaultSeverity,
            message: `Ukuran kertas ${num(s.pageWidthCm)} x ${num(s.pageHeightCm)} cm, seharusnya ${expected}.`,
            suggestion: `Ubah ukuran kertas ke ${expected} di Tata Letak > Ukuran.`,
          },
        ];
      }
    }
    return [];
  },
};

const SIDES = [
  ["left", "kiri", "marginLeftCm"],
  ["top", "atas", "marginTopCm"],
  ["right", "kanan", "marginRightCm"],
  ["bottom", "bawah", "marginBottomCm"],
] as const;

export const margins: Checker = {
  code: "FMT-002",
  category: "format",
  defaultSeverity: "critical",
  run(doc, rules) {
    const tol = rules.page.margin_tolerance_cm;
    const issues: Issue[] = [];
    const reported = new Set<string>();
    for (const s of doc.sections) {
      for (const [key, label, prop] of SIDES) {
        const actual = s[prop];
        const want = rules.page.margins_cm[key];
        if (Math.abs(actual - want) > tol && !reported.has(key)) {
          reported.add(key);
          issues.push({
            category: "format",
            ruleCode: this.code,
            severity: this.defaultSeverity,
            message: `Margin ${label} ${num(actual)} cm, seharusnya ${num(want)} cm.`,
            suggestion: `Atur margin ${label} menjadi ${num(want)} cm.`,
            location: { headingPath: [`Bagian ${s.index + 1}`] },
          });
        }
      }
    }
    return issues;
  },
};

export const bodyFontFamily: Checker = {
  code: "FMT-003",
  category: "format",
  defaultSeverity: "major",
  run(doc, rules) {
    const want = rules.body.font_family;
    const issues: Issue[] = [];
    for (const p of bodyParagraphs(doc)) {
      const names = p.runs.filter((r) => r.fontName && r.text.trim()).map((r) => r.fontName!);
      const actual = dominant(names);
      if (actual && actual.toLowerCase() !== want.toLowerCase()) {
        issues.push({
          category: "format",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `Jenis huruf ${actual}, seharusnya ${want}.`,
          suggestion: `Ubah jenis huruf paragraf ini ke ${want}.`,
          excerpt: excerptOf(p),
          location: { paragraphIndex: p.index, page: p.page },
        });
      }
    }
    return cap(issues);
  },
};

const SYMBOL_FONTS = new Set(["symbol", "cambria math", "wingdings", "webdings"]);

/** Satu bagian paragraf memakai huruf lain padahal paragrafnya sendiri sudah benar. */
export const mixedFont: Checker = {
  code: "FMT-014",
  category: "format",
  defaultSeverity: "minor",
  run(doc, rules) {
    const want = rules.body.font_family.toLowerCase();
    const issues: Issue[] = [];
    for (const p of bodyParagraphs(doc)) {
      const named = p.runs.filter((r) => r.fontName && r.text.trim());
      if (dominant(named.map((r) => r.fontName!.toLowerCase())) !== want) continue; // FMT-003
      const odd = named.find(
        (r) =>
          r.fontName!.toLowerCase() !== want &&
          !SYMBOL_FONTS.has(r.fontName!.toLowerCase()) &&
          r.text.trim().length >= 3,
      );
      if (!odd) continue;
      issues.push({
        category: "format",
        ruleCode: this.code,
        severity: this.defaultSeverity,
        message: `Sebagian teks memakai ${odd.fontName}, seharusnya ${rules.body.font_family}.`,
        suggestion: `Ubah jenis huruf "${odd.text.trim().slice(0, 40)}" ke ${rules.body.font_family}.`,
        excerpt: odd.text.trim().slice(0, 120),
        location: { paragraphIndex: p.index, page: p.page },
      });
    }
    return cap(issues);
  },
};

export const bodyFontSize: Checker = {
  code: "FMT-004",
  category: "format",
  defaultSeverity: "major",
  run(doc, rules) {
    const want = rules.body.font_size_pt;
    const issues: Issue[] = [];
    for (const p of bodyParagraphs(doc)) {
      const sizes = p.runs.filter((r) => r.fontSizePt && r.text.trim()).map((r) => r.fontSizePt!);
      const actual = dominant(sizes);
      if (actual !== undefined && Math.abs(actual - want) > 0.01) {
        issues.push({
          category: "format",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `Ukuran huruf ${num(actual)} pt, seharusnya ${num(want)} pt.`,
          suggestion: `Ubah ukuran huruf paragraf ini ke ${num(want)} pt.`,
          excerpt: excerptOf(p),
          location: { paragraphIndex: p.index, page: p.page },
        });
      }
    }
    return cap(issues);
  },
};

const wordCount = (p: ParsedParagraph): number => p.text.trim().split(/\s+/).filter(Boolean).length;

export const lineSpacing: Checker = {
  code: "FMT-005",
  category: "format",
  defaultSeverity: "major",
  run(doc, rules) {
    const allowed = Array.isArray(rules.body.line_spacing)
      ? rules.body.line_spacing
      : [rules.body.line_spacing];
    const label = allowed.map(num).join(" atau ");
    const issues: Issue[] = [];
    for (const p of bodyParagraphs(doc)) {
      if (p.lineSpacing === null || wordCount(p) < 8) continue;
      if (!allowed.some((a) => Math.abs(p.lineSpacing! - a) < 0.05)) {
        issues.push({
          category: "format",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `Spasi baris ${num(p.lineSpacing)}, seharusnya ${label}.`,
          suggestion: `Atur spasi baris paragraf ini menjadi ${label}.`,
          excerpt: excerptOf(p),
          location: { paragraphIndex: p.index, page: p.page },
        });
      }
    }
    return cap(issues);
  },
};

export const firstLineIndent: Checker = {
  code: "FMT-006",
  category: "format",
  defaultSeverity: "minor",
  run(doc, rules) {
    const want = rules.body.first_line_indent_cm;
    const issues: Issue[] = [];
    for (const p of bodyParagraphs(doc)) {
      if (wordCount(p) < 8) continue;
      const actual = p.firstLineIndentCm ?? 0;
      if (Math.abs(actual - want) > 0.15) {
        issues.push({
          category: "format",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `Indentasi baris pertama ${num(actual)} cm, seharusnya ${num(want)} cm.`,
          suggestion: `Atur indentasi baris pertama menjadi ${num(want)} cm.`,
          excerpt: excerptOf(p),
          location: { paragraphIndex: p.index, page: p.page },
        });
      }
    }
    return cap(issues);
  },
};

const ALIGN_NAME: Record<string, string> = {
  justify: "rata kiri kanan",
  left: "rata kiri",
  center: "tengah",
  right: "rata kanan",
};

export const alignment: Checker = {
  code: "FMT-007",
  category: "format",
  defaultSeverity: "minor",
  run(doc, rules) {
    const want = rules.body.alignment;
    const issues: Issue[] = [];
    for (const p of bodyParagraphs(doc)) {
      if (wordCount(p) < 8) continue;
      const actual = p.alignment ?? "left";
      if (actual !== want) {
        issues.push({
          category: "format",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `Perataan ${ALIGN_NAME[actual]}, seharusnya ${ALIGN_NAME[want]}.`,
          suggestion: `Ubah perataan paragraf menjadi ${ALIGN_NAME[want]}.`,
          excerpt: excerptOf(p),
          location: { paragraphIndex: p.index, page: p.page },
        });
      }
    }
    return cap(issues);
  },
};

export const chapterHeading: Checker = {
  code: "FMT-008",
  category: "format",
  defaultSeverity: "major",
  run(doc, rules) {
    const cfg = rules.chapter_heading;
    const issues: Issue[] = [];
    for (const p of doc.paragraphs) {
      if (!p.isChapterHeading) continue;
      const problems: string[] = [];
      const text = p.text.trim();
      if (cfg.uppercase && text !== text.toUpperCase()) problems.push("huruf kapital semua");
      if (cfg.alignment && (p.alignment ?? "left") !== cfg.alignment)
        problems.push(ALIGN_NAME[cfg.alignment]!);
      if (cfg.bold && p.runs.length > 0 && !p.runs.every((r) => r.bold)) problems.push("tebal");
      if (problems.length > 0) {
        issues.push({
          category: "format",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `Judul bab belum ${problems.join(", ")}.`,
          suggestion: "Samakan format judul bab dengan pedoman.",
          excerpt: text.slice(0, 120),
          location: { paragraphIndex: p.index, page: p.page, headingPath: [text.slice(0, 80)] },
        });
      }
    }
    return issues;
  },
};

/** Indeks section pertama yang memuat BAB I (awal isi naskah). */
function bodyStartSection(doc: ParsedDocument): number | null {
  const first = doc.paragraphs.find((p) => p.isChapterHeading);
  return first ? first.sectionIndex : null;
}

export const pageNumbering: Checker = {
  code: "FMT-009",
  category: "format",
  defaultSeverity: "critical",
  run(doc, rules) {
    const start = bodyStartSection(doc);
    if (start === null) return []; // tanpa judul bab, STR-001 yang melapor

    if (doc.sections.length === 1) {
      return [
        {
          category: "format",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message:
            "Naskah hanya punya satu bagian (section), jadi nomor romawi untuk halaman awal dan angka untuk isi tidak bisa dipisah.",
          suggestion: `Sisipkan section break sebelum ${rules.page_numbering.body_starts_at}, lalu atur format nomor halaman tiap bagian.`,
        },
      ];
    }

    const issues: Issue[] = [];
    const wantFront =
      rules.page_numbering.front_matter === "lower_roman" ? "lowerRoman" : "decimal";
    const wantBody = rules.page_numbering.body === "arabic" ? "decimal" : "lowerRoman";
    const fmtLabel = (f: string): string =>
      f === "lowerRoman" ? "romawi kecil (i, ii, iii)" : "angka (1, 2, 3)";

    for (const s of doc.sections) {
      const isBody = s.index >= start;
      const want = isBody ? wantBody : wantFront;
      const actual = s.pageNumberFormat ?? "decimal";
      // Bagian awal yang tidak bernomor (halaman judul) dibiarkan.
      if (!isBody && !s.hasPageNumberField) continue;
      if (isBody && !s.hasPageNumberField) {
        issues.push({
          category: "format",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `Bagian ${s.index + 1} (isi naskah) tidak punya nomor halaman.`,
          suggestion: "Tambahkan nomor halaman di footer.",
          location: { headingPath: [`Bagian ${s.index + 1}`] },
        });
        continue;
      }
      if (actual !== want) {
        issues.push({
          category: "format",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `Nomor halaman bagian ${s.index + 1} berformat ${fmtLabel(actual)}, seharusnya ${fmtLabel(want)}.`,
          suggestion: `Ubah format nomor halaman bagian ini menjadi ${fmtLabel(want)}.`,
          location: { headingPath: [`Bagian ${s.index + 1}`] },
        });
      }
    }
    return issues;
  },
};

const TABLE_CAPTION = /^\s*Tabel\s+(\d+)(?:\.(\d+))?/i;
const FIGURE_CAPTION = /^\s*Gambar\s+(\d+)(?:\.(\d+))?/i;

function elementIndex(doc: ParsedDocument, paragraphIndex: number): number {
  return doc.elements.findIndex((e) => e.kind === "p" && e.index === paragraphIndex);
}

export const captionPosition: Checker = {
  code: "FMT-010",
  category: "format",
  defaultSeverity: "major",
  run(doc, rules) {
    const issues: Issue[] = [];
    const { table_position, figure_position } = rules.captions;
    for (const p of doc.paragraphs) {
      if (p.isToc || p.text.length > 200) continue;
      const isTable = TABLE_CAPTION.test(p.text);
      const isFigure = FIGURE_CAPTION.test(p.text);
      if (!isTable && !isFigure) continue;
      const at = elementIndex(doc, p.index);
      const before = doc.elements[at - 1];
      const after = doc.elements[at + 1];
      const isDrawing = (e: typeof before): boolean =>
        e?.kind === "p" && doc.paragraphs[e.index]?.hasDrawing === true;

      if (isTable) {
        const above = after?.kind === "tbl";
        const below = before?.kind === "tbl";
        if (!above && !below) continue; // bukan caption sungguhan (kalimat rujukan)
        const actual = above ? "above" : "below";
        if (actual !== table_position) {
          issues.push({
            category: "format",
            ruleCode: this.code,
            severity: this.defaultSeverity,
            message: `Caption tabel di ${actual === "above" ? "atas" : "bawah"} tabel, seharusnya di ${table_position === "above" ? "atas" : "bawah"}.`,
            suggestion: `Pindahkan caption ke ${table_position === "above" ? "atas" : "bawah"} tabel.`,
            excerpt: p.text.trim().slice(0, 120),
            location: { paragraphIndex: p.index, page: p.page },
          });
        }
      } else {
        const above = isDrawing(after);
        const below = isDrawing(before);
        if (!above && !below) continue;
        const actual = above ? "above" : "below";
        if (actual !== figure_position) {
          issues.push({
            category: "format",
            ruleCode: this.code,
            severity: this.defaultSeverity,
            message: `Caption gambar di ${actual === "above" ? "atas" : "bawah"} gambar, seharusnya di ${figure_position === "above" ? "atas" : "bawah"}.`,
            suggestion: `Pindahkan caption ke ${figure_position === "above" ? "atas" : "bawah"} gambar.`,
            excerpt: p.text.trim().slice(0, 120),
            location: { paragraphIndex: p.index, page: p.page },
          });
        }
      }
    }
    return cap(issues);
  },
};

export const captionNumbering: Checker = {
  code: "FMT-011",
  category: "format",
  defaultSeverity: "major",
  run(doc) {
    const issues: Issue[] = [];
    for (const [label, re] of [
      ["Tabel", TABLE_CAPTION],
      ["Gambar", FIGURE_CAPTION],
    ] as const) {
      // nomor terakhir per bab
      const lastByChapter = new Map<number, number>();
      for (const p of doc.paragraphs) {
        if (p.isToc || p.text.length > 200) continue;
        const m = re.exec(p.text);
        if (!m || m[2] === undefined) continue;
        const chapter = Number(m[1]);
        const seq = Number(m[2]);
        const prev = lastByChapter.get(chapter) ?? 0;
        if (seq !== prev + 1 && seq > prev) {
          issues.push({
            category: "format",
            ruleCode: this.code,
            severity: this.defaultSeverity,
            message: `${label} ${chapter}.${seq} muncul setelah ${label.toLowerCase()} ${chapter}.${prev}, ada nomor yang terlewat.`,
            suggestion: `Periksa penomoran ${label.toLowerCase()} di bab ${chapter}.`,
            excerpt: p.text.trim().slice(0, 120),
            location: { paragraphIndex: p.index, page: p.page },
          });
        }
        lastByChapter.set(chapter, Math.max(prev, seq));
      }
    }
    return cap(issues);
  },
};

export const formatCheckers: Checker[] = [
  paperSize,
  margins,
  bodyFontFamily,
  bodyFontSize,
  lineSpacing,
  firstLineIndent,
  alignment,
  chapterHeading,
  pageNumbering,
  captionPosition,
  captionNumbering,
  mixedFont,
];
