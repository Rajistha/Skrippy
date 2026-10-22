import type { Checker, Issue, ParsedParagraph } from "../types";
import { bodyParagraphs } from "../types";
import nonstandard from "./nonstandard-words.json";

const MAX_PER_RULE = 25;
export const WORDS = nonstandard as Record<string, string>;

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Kutipan sekitar temuan, maksimal ±40 karakter. */
function around(text: string, start: number, end: number): string {
  return text.slice(Math.max(0, start - 40), end + 40).trim();
}

type Match = { start: number; end: number };

function issue(
  code: string,
  severity: Issue["severity"],
  p: ParsedParagraph,
  m: Match,
  message: string,
  suggestion: string,
): Issue {
  return {
    category: "spelling",
    ruleCode: code,
    severity,
    message,
    suggestion,
    excerpt: around(p.text, m.start, m.end),
    location: { paragraphIndex: p.index, page: p.page, charStart: m.start, charEnd: m.end },
  };
}

const NONSTANDARD_RE = new RegExp(
  `(?<![\\p{L}])(${Object.keys(WORDS).map(escapeRe).join("|")})(?![\\p{L}])`,
  "giu",
);

export const nonStandardWord: Checker = {
  code: "EJA-001",
  category: "spelling",
  defaultSeverity: "major",
  run(doc, rules) {
    const extra = rules.dictionary?.nonstandard ?? {};
    const words: Record<string, string> = { ...WORDS, ...extra };
    const re =
      Object.keys(extra).length === 0
        ? NONSTANDARD_RE
        : new RegExp(
            `(?<![\p{L}])(${Object.keys(words).map(escapeRe).join("|")})(?![\p{L}])`,
            "giu",
          );
    const issues: Issue[] = [];
    for (const p of bodyParagraphs(doc)) {
      for (const m of p.text.matchAll(re)) {
        const wrong = m[1]!;
        const right = words[wrong.toLowerCase()]!;
        issues.push(
          issue(
            this.code,
            this.defaultSeverity,
            p,
            { start: m.index!, end: m.index! + wrong.length },
            `Kata tidak baku "${wrong}", seharusnya "${right}".`,
            `Ganti dengan "${right}".`,
          ),
        );
      }
    }
    return issues.slice(0, MAX_PER_RULE);
  },
};

/** "di"/"ke" sebagai kata depan ditulis terpisah; imbuhan di- ditulis serangkai. Daftar kata, bukan tebakan. */
export const MERGED_PREPOSITIONS: Record<string, string> = {
  dibawah: "di bawah",
  diatas: "di atas",
  didalam: "di dalam",
  diluar: "di luar",
  disekitar: "di sekitar",
  dimana: "di mana",
  diantara: "di antara",
  kedalam: "ke dalam",
  keatas: "ke atas",
  kebawah: "ke bawah",
};

const SEPARATED_PREFIX_VERBS = [
  "lakukan",
  "gunakan",
  "buat",
  "ambil",
  "tentukan",
  "jelaskan",
  "lihat",
  "analisis",
  "peroleh",
  "bandingkan",
  "tunjukkan",
  "sebut",
  "simpulkan",
  "kumpulkan",
  "olah",
  "ukur",
  "uji",
  "ajukan",
];

const MERGED_RE = new RegExp(
  `(?<![\\p{L}])(${Object.keys(MERGED_PREPOSITIONS).map(escapeRe).join("|")})(?![\\p{L}])`,
  "giu",
);
const SEPARATED_RE = new RegExp(
  `(?<![\\p{L}])(di)\\s+(${SEPARATED_PREFIX_VERBS.join("|")})(?![\\p{L}])`,
  "giu",
);

export const diKe: Checker = {
  code: "EJA-002",
  category: "spelling",
  defaultSeverity: "major",
  run(doc) {
    const issues: Issue[] = [];
    for (const p of bodyParagraphs(doc)) {
      for (const m of p.text.matchAll(MERGED_RE)) {
        const right = MERGED_PREPOSITIONS[m[1]!.toLowerCase()]!;
        issues.push(
          issue(
            this.code,
            this.defaultSeverity,
            p,
            { start: m.index!, end: m.index! + m[0].length },
            `"${m[1]}" sebagai kata depan ditulis terpisah: "${right}".`,
            `Tulis "${right}".`,
          ),
        );
      }
      for (const m of p.text.matchAll(SEPARATED_RE)) {
        const joined = `di${m[2]}`;
        issues.push(
          issue(
            this.code,
            this.defaultSeverity,
            p,
            { start: m.index!, end: m.index! + m[0].length },
            `"${m[0]}" memakai di- sebagai imbuhan, ditulis serangkai: "${joined}".`,
            `Tulis "${joined}".`,
          ),
        );
      }
    }
    return issues.slice(0, MAX_PER_RULE);
  },
};

export const doubleSpace: Checker = {
  code: "EJA-003",
  category: "spelling",
  defaultSeverity: "minor",
  run(doc) {
    const issues: Issue[] = [];
    for (const p of bodyParagraphs(doc)) {
      const m = /\S {2,}\S/.exec(p.text);
      if (m) {
        issues.push(
          issue(
            this.code,
            this.defaultSeverity,
            p,
            { start: m.index, end: m.index + m[0].length },
            "Ada spasi ganda.",
            "Hapus spasi yang berlebih.",
          ),
        );
      }
    }
    return issues.slice(0, MAX_PER_RULE);
  },
};

const SPACE_BEFORE = /\p{L} +[,.;:!?](?=\s|$)/u;
const NO_SPACE_AFTER = /[a-z][,;:][A-Za-z]/;

export const punctuationSpacing: Checker = {
  code: "EJA-004",
  category: "spelling",
  defaultSeverity: "minor",
  run(doc) {
    const issues: Issue[] = [];
    for (const p of bodyParagraphs(doc)) {
      for (const [re, msg, tip] of [
        [SPACE_BEFORE, "Ada spasi sebelum tanda baca.", "Hapus spasi sebelum tanda baca."],
        [
          NO_SPACE_AFTER,
          "Tidak ada spasi setelah tanda baca.",
          "Tambahkan spasi setelah tanda baca.",
        ],
      ] as const) {
        const m = re.exec(p.text);
        if (m) {
          issues.push(
            issue(
              this.code,
              this.defaultSeverity,
              p,
              { start: m.index, end: m.index + m[0].length },
              msg,
              tip,
            ),
          );
        }
      }
    }
    return issues.slice(0, MAX_PER_RULE);
  },
};

/** Singkatan yang diakhiri titik tapi bukan akhir kalimat. */
const ABBREVIATIONS =
  /(?:dkk|dsb|dll|dst|mis|yg|dg|tsb|hlm|no|vol|ed|et al|cf|vs|sd|s\.d|a\.n|u\.p|e\.g|i\.e|dr|prof|ir|drs|mr|mrs|ms|bpk|ibu|tgl|jl|st)\.$/i;

export const sentenceCapital: Checker = {
  code: "EJA-005",
  category: "spelling",
  defaultSeverity: "minor",
  run(doc) {
    const issues: Issue[] = [];
    for (const p of bodyParagraphs(doc)) {
      const re = /([.!?])\s+(\p{Ll})/gu;
      for (const m of p.text.matchAll(re)) {
        const before = p.text.slice(0, m.index! + 1);
        const lastWord = /(\S+)$/.exec(before)?.[1] ?? "";
        // Lewati singkatan, angka bertitik (2.1), dan inisial ("A. Nama").
        if (ABBREVIATIONS.test(lastWord) || /\d\.$/.test(lastWord) || /^\p{Lu}\.$/u.test(lastWord))
          continue;
        issues.push(
          issue(
            this.code,
            this.defaultSeverity,
            p,
            { start: m.index!, end: m.index! + m[0].length },
            "Kalimat dimulai dengan huruf kecil.",
            "Awali kalimat dengan huruf kapital.",
          ),
        );
        break;
      }
    }
    return issues.slice(0, MAX_PER_RULE);
  },
};

/** Istilah asing umum yang dicetak miring di naskah. Daftar kecil agar tidak ada temuan palsu. */
const FOREIGN_TERMS = [
  "machine learning",
  "deep learning",
  "dataset",
  "framework",
  "database",
  "software",
  "hardware",
  "website",
  "server",
  "client",
  "user",
  "interface",
  "backend",
  "frontend",
  "online",
  "offline",
  "feedback",
  "input",
  "output",
  "update",
  "download",
  "upload",
  "login",
  "cloud",
  "big data",
];
const FOREIGN_RE = new RegExp(
  `(?<![\\p{L}])(${FOREIGN_TERMS.map(escapeRe).join("|")})(?![\\p{L}])`,
  "giu",
);

export const foreignTermItalic: Checker = {
  code: "EJA-006",
  category: "spelling",
  defaultSeverity: "minor",
  run(doc, rules) {
    const extra = rules.dictionary?.foreign ?? [];
    const re =
      extra.length === 0
        ? FOREIGN_RE
        : new RegExp(
            `(?<![\p{L}])(${[...FOREIGN_TERMS, ...extra].map(escapeRe).join("|")})(?![\p{L}])`,
            "giu",
          );
    const issues: Issue[] = [];
    for (const p of bodyParagraphs(doc)) {
      // Peta posisi karakter -> apakah run itu miring.
      const italicAt: boolean[] = [];
      for (const r of p.runs) for (let i = 0; i < r.text.length; i++) italicAt.push(r.italic);
      if (italicAt.length !== p.text.length) continue; // teks tidak selaras dengan run, lewati agar aman
      for (const m of p.text.matchAll(re)) {
        const start = m.index!;
        const slice = italicAt.slice(start, start + m[0].length);
        if (slice.length > 0 && slice.every((x) => !x)) {
          issues.push(
            issue(
              this.code,
              this.defaultSeverity,
              p,
              { start, end: start + m[0].length },
              `Istilah asing "${m[0]}" belum dicetak miring.`,
              `Cetak miring "${m[0]}".`,
            ),
          );
        }
      }
    }
    return issues.slice(0, MAX_PER_RULE);
  },
};

export const repeatedWord: Checker = {
  code: "EJA-007",
  category: "spelling",
  defaultSeverity: "minor",
  run(doc) {
    const issues: Issue[] = [];
    for (const p of bodyParagraphs(doc)) {
      const m = /(?<![\p{L}\d-])(\p{L}{2,})[ \t]+\1(?![\p{L}\d-])/iu.exec(p.text);
      if (m) {
        issues.push(
          issue(
            this.code,
            this.defaultSeverity,
            p,
            { start: m.index, end: m.index + m[0].length },
            `Kata "${m[1]}" tertulis dua kali berurutan.`,
            `Hapus salah satu "${m[1]}". Untuk kata ulang, pakai tanda hubung.`,
          ),
        );
      }
    }
    return issues.slice(0, MAX_PER_RULE);
  },
};

const LIST_MARKER = /(^|\s)[a-z0-9]{1,2}\)/i;
const count = (text: string, ch: string): number => text.split(ch).length - 1;

export const pairedMarks: Checker = {
  code: "EJA-008",
  category: "spelling",
  defaultSeverity: "minor",
  run(doc) {
    const issues: Issue[] = [];
    for (const p of bodyParagraphs(doc)) {
      const problems: Array<{ at: number; message: string; suggestion: string }> = [];
      for (const [open, close, name] of [
        ["(", ")", "kurung"],
        ["[", "]", "kurung siku"],
      ] as const) {
        const o = count(p.text, open);
        const c = count(p.text, close);
        if (o > c) {
          problems.push({
            at: p.text.indexOf(open),
            message: `Tanda ${name} dibuka tetapi tidak ditutup.`,
            suggestion: `Tambahkan "${close}" pada tempat yang sesuai.`,
          });
        } else if (c > o && !(close === ")" && LIST_MARKER.test(p.text))) {
          problems.push({
            at: p.text.indexOf(close),
            message: `Tanda ${name} ditutup tetapi tidak pernah dibuka.`,
            suggestion: `Tambahkan "${open}" atau hapus "${close}".`,
          });
        }
      }
      const straight = count(p.text, '"');
      const curly = count(p.text, "“") - count(p.text, "”");
      if (straight % 2 === 1 || curly !== 0) {
        problems.push({
          at: Math.max(0, p.text.search(/["“”]/)),
          message: "Tanda kutip tidak berpasangan.",
          suggestion: "Pastikan setiap tanda kutip pembuka punya penutup.",
        });
      }
      const dup = /,,|;;|::|(?<!\.)\.\.(?!\.)/.exec(p.text);
      if (dup) {
        problems.push({
          at: dup.index,
          message: `Tanda baca ganda "${dup[0]}".`,
          suggestion: "Hapus tanda baca yang berlebih.",
        });
      }
      const first = problems[0];
      if (first) {
        issues.push(
          issue(
            this.code,
            this.defaultSeverity,
            p,
            { start: first.at, end: first.at + 1 },
            first.message,
            first.suggestion,
          ),
        );
      }
    }
    return issues.slice(0, MAX_PER_RULE);
  },
};

const UNIT_GLUED =
  /(?<![\p{L}\d.,])\d+(?:[.,]\d+)?(kg|mg|gr|km|cm|mm|ml|mb|gb|tb|hz|khz|mhz|ghz|rpm|watt)(?![\p{L}])/iu;

export const numberUnitSpacing: Checker = {
  code: "EJA-009",
  category: "spelling",
  defaultSeverity: "minor",
  run(doc) {
    const issues: Issue[] = [];
    for (const p of bodyParagraphs(doc)) {
      const m = UNIT_GLUED.exec(p.text);
      if (m) {
        const unit = m[1]!;
        issues.push(
          issue(
            this.code,
            this.defaultSeverity,
            p,
            { start: m.index, end: m.index + m[0].length },
            `Angka dan satuan "${m[0]}" ditulis menyatu.`,
            `Beri spasi: "${m[0].slice(0, m[0].length - unit.length)} ${unit}".`,
          ),
        );
      }
    }
    return issues.slice(0, MAX_PER_RULE);
  },
};

const HYPHENATED_WORD = /(?<![\p{L}-])\p{L}(?:[\p{L}-]*\p{L})?(?![\p{L}-])/gu;

/** Istilah yang sama ditulis dengan dan tanpa tanda hubung ("e-commerce" dan "ecommerce"). */
export const termConsistency: Checker = {
  code: "EJA-011",
  category: "spelling",
  defaultSeverity: "minor",
  run(doc) {
    type Form = { count: number; p: ParsedParagraph; start: number };
    const byKey = new Map<string, Map<string, Form>>();
    for (const p of bodyParagraphs(doc)) {
      for (const m of p.text.matchAll(HYPHENATED_WORD)) {
        const form = m[0].toLowerCase();
        const key = form.replace(/-/g, "");
        if (key.length < 5) continue;
        const forms = byKey.get(key) ?? new Map<string, Form>();
        const seen = forms.get(form);
        if (seen) seen.count++;
        else forms.set(form, { count: 1, p, start: m.index! });
        byKey.set(key, forms);
      }
    }
    const issues: Issue[] = [];
    for (const forms of byKey.values()) {
      if (forms.size < 2) continue;
      const ranked = [...forms.entries()].sort((a, b) => b[1].count - a[1].count);
      const dominant = ranked[0]![0];
      for (const [form, info] of ranked.slice(1)) {
        issues.push(
          issue(
            this.code,
            this.defaultSeverity,
            info.p,
            { start: info.start, end: info.start + form.length },
            `Istilah ditulis tidak konsisten: "${form}" dan "${dominant}".`,
            `Samakan penulisan menjadi "${dominant}".`,
          ),
        );
      }
    }
    return issues.slice(0, MAX_PER_RULE);
  },
};

const ABBR_DEFINITION = /\(([A-Z][A-Z0-9]{1,7})\)/g;
const ROMAN = /^[IVXLCDM]+$/;

/** Singkatan yang dipakai sebelum dijelaskan, atau dijelaskan tetapi tidak pernah dipakai. */
export const abbreviationUse: Checker = {
  code: "EJA-012",
  category: "spelling",
  defaultSeverity: "minor",
  run(doc) {
    const paragraphs = bodyParagraphs(doc);
    const defined = new Map<string, { at: number; start: number }>();
    paragraphs.forEach((p, at) => {
      for (const m of p.text.matchAll(ABBR_DEFINITION)) {
        const abbr = m[1]!;
        if (!ROMAN.test(abbr) && !defined.has(abbr)) defined.set(abbr, { at, start: m.index! });
      }
    });
    const issues: Issue[] = [];
    for (const [abbr, def] of defined) {
      const re = new RegExp(`(?<![\\p{L}\\d])${abbr}(?![\\p{L}\\d])`, "gu");
      let early: { at: number; start: number } | null = null;
      let uses = 0;
      paragraphs.forEach((p, at) => {
        for (const m of p.text.matchAll(re)) {
          const start = m.index!;
          if (at === def.at && start === def.start + 1) continue; // isi kurung definisi itu sendiri
          uses++;
          const before = at < def.at || (at === def.at && start < def.start);
          if (before && !early) early = { at, start };
        }
      });
      const hit = early as { at: number; start: number } | null;
      if (hit) {
        issues.push(
          issue(
            this.code,
            this.defaultSeverity,
            paragraphs[hit.at]!,
            { start: hit.start, end: hit.start + abbr.length },
            `Singkatan "${abbr}" dipakai sebelum dijelaskan.`,
            `Tulis kepanjangannya dengan "(${abbr})" saat pertama kali muncul.`,
          ),
        );
      } else if (uses === 0) {
        issues.push(
          issue(
            this.code,
            this.defaultSeverity,
            paragraphs[def.at]!,
            { start: def.start, end: def.start + abbr.length + 2 },
            `Singkatan "${abbr}" dijelaskan tetapi tidak pernah dipakai lagi.`,
            "Hapus singkatan, atau pakai singkatan itu di bagian berikutnya.",
          ),
        );
      }
    }
    return issues.slice(0, MAX_PER_RULE);
  },
};

export const spellingCheckers: Checker[] = [
  nonStandardWord,
  diKe,
  doubleSpace,
  punctuationSpacing,
  sentenceCapital,
  foreignTermItalic,
  repeatedWord,
  pairedMarks,
  numberUnitSpacing,
  termConsistency,
  abbreviationUse,
];
