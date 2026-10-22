/**
 * Perbaikan otomatis yang aman untuk salinan naskah (.docx). Murni: bytes masuk, bytes keluar.
 *
 * Hanya mengubah teks di dalam satu run (w:t) dan tidak menyentuh format, tabel, gambar, atau daftar pustaka:
 * kata tidak baku (EJA-001), "di"/"ke" yang digabung (EJA-002), spasi ganda (EJA-003), dan spasi sebelum
 * tanda baca (EJA-004). File asli tidak diubah.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { MERGED_PREPOSITIONS, WORDS } from "../checkers/spelling/rules";
import type { Rules } from "../checkers/types";
import { findTopLevelParagraphs } from "./annotate-docx";
import { fixMargins, fixParagraphInner, type ParagraphFix } from "./fix-format";

const MAX_UNCOMPRESSED = 200 * 1024 * 1024;

export type FixSummary = {
  nonStandard: number;
  mergedPrepositions: number;
  doubleSpaces: number;
  spaceBeforePunctuation: number;
  fonts: number;
  sizes: number;
  spacings: number;
  margins: number;
};

/** Perbaikan format: paragraf mana yang perlu diubah (menurut hasil parse) dan aturan tujuannya. */
export type FormatFix = {
  rules: Pick<Rules, "body" | "page">;
  paragraphs: Map<number, ParagraphFix>;
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const alternation = (keys: string[]): string => keys.map(escapeRe).join("|");

const NONSTANDARD = new RegExp(
  `(?<![\\p{L}])(${alternation(Object.keys(WORDS))})(?![\\p{L}])`,
  "giu",
);
const MERGED = new RegExp(
  `(?<![\\p{L}])(${alternation(Object.keys(MERGED_PREPOSITIONS))})(?![\\p{L}])`,
  "giu",
);
const SPACE_BEFORE_PUNCT = /(?<=[\p{L}\d]) +(?=[,.;:!?](?:\s|$))/gu;
const DOUBLE_SPACE = /(?<=\S) {2,}(?=\S)/g;

/** Pertahankan huruf kapital di awal kata pengganti. */
const matchCase = (original: string, replacement: string): string =>
  original.charAt(0) !== original.charAt(0).toLowerCase()
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement;

export function fixText(text: string, summary: FixSummary): string {
  let out = text.replace(NONSTANDARD, (m) => {
    summary.nonStandard++;
    return matchCase(m, WORDS[m.toLowerCase()]!);
  });
  out = out.replace(MERGED, (m) => {
    summary.mergedPrepositions++;
    return matchCase(m, MERGED_PREPOSITIONS[m.toLowerCase()]!);
  });
  out = out.replace(SPACE_BEFORE_PUNCT, () => {
    summary.spaceBeforePunctuation++;
    return "";
  });
  out = out.replace(DOUBLE_SPACE, () => {
    summary.doubleSpaces++;
    return " ";
  });
  return out;
}

const TEXT_NODE = /(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g;

/**
 * @param untilParagraph paragraf dengan nomor parser sama atau lebih besar dari ini tidak diubah
 *   (dipakai untuk melewati daftar pustaka). Null: seluruh paragraf tingkat atas.
 */
export function fixDocx(
  data: Uint8Array,
  untilParagraph: number | null,
  format?: FormatFix,
): { bytes: Uint8Array; summary: FixSummary; total: number } {
  let size = 0;
  unzipSync(data, {
    filter: (f) => {
      size += f.originalSize;
      return false;
    },
  });
  if (size > MAX_UNCOMPRESSED) throw new Error("docx_too_large");
  const files = unzipSync(data);
  const docBytes = files["word/document.xml"];
  if (!docBytes) throw new Error("docx_invalid");

  const summary: FixSummary = {
    nonStandard: 0,
    mergedPrepositions: 0,
    doubleSpaces: 0,
    spaceBeforePunctuation: 0,
    fonts: 0,
    sizes: 0,
    spacings: 0,
    margins: 0,
  };
  let xml = strFromU8(docBytes);
  const spans = findTopLevelParagraphs(xml);
  const last = untilParagraph === null ? spans.length : Math.min(untilParagraph, spans.length);
  // Dari belakang ke depan agar posisi paragraf sebelumnya tidak bergeser.
  for (let i = last - 1; i >= 0; i--) {
    const span = spans[i]!;
    if (span.close === null) continue;
    const from = span.open[1];
    const inner = xml.slice(from, span.close);
    const fixed = inner.replace(
      TEXT_NODE,
      (_m, open: string, text: string, close: string) => `${open}${fixText(text, summary)}${close}`,
    );
    let result = fixed;
    const need = format?.paragraphs.get(i);
    if (format && need && (need.font || need.size || need.spacing)) {
      const spacing = format.rules.body.line_spacing;
      result = fixParagraphInner(result, need, {
        font: format.rules.body.font_family,
        sizePt: format.rules.body.font_size_pt,
        lineSpacing: Array.isArray(spacing) ? spacing[0]! : spacing,
      });
      if (need.font) summary.fonts++;
      if (need.size) summary.sizes++;
      if (need.spacing) summary.spacings++;
    }
    if (result !== inner) xml = xml.slice(0, from) + result + xml.slice(span.close);
  }
  if (format) {
    const m = format.rules.page.margins_cm;
    const out = fixMargins(xml, m);
    xml = out.xml;
    summary.margins = out.changed;
  }

  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  if (total === 0) return { bytes: data, summary, total };

  const zippable: Zippable = {};
  for (const [name, bytes] of Object.entries(files)) {
    const content = name === "word/document.xml" ? strToU8(xml) : bytes;
    zippable[name] = /^word\/media\//.test(name)
      ? [content, { level: 0 }]
      : [content, { level: 6 }];
  }
  return { bytes: zipSync(zippable), summary, total };
}
