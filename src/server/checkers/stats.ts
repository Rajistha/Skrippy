/** Statistik naskah (bukan temuan): ukuran per bab, kepadatan sitasi, keterbacaan, umur sumber. Murni. */
import { chapterRanges } from "./structure/extra";
import { findSections } from "./structure/rules";
import type { ParsedDocument, Rules } from "./types";
import { bodyParagraphs } from "./types";

export type ChapterStat = {
  name: string;
  words: number;
  citations: number;
};

export type ManuscriptStats = {
  words: number;
  paragraphs: number;
  tables: number;
  figures: number;
  footnotes: number;
  chapters: ChapterStat[];
  readability: {
    sentences: number;
    avgSentenceWords: number;
    /** Persentase kalimat di atas batas `max_sentence_words`. */
    longSentencePct: number;
    /** Perkiraan persentase kalimat pasif (kata kerja berawalan di-). */
    passivePct: number;
  };
  sources: {
    total: number;
    /** Persentase sumber yang terbit dalam `max_source_age_years` terakhir; null bila tanpa sumber bertahun. */
    recentPct: number | null;
    medianYear: number | null;
  };
};

const WORD = /[\p{L}\d]+/gu;
const CITE = /\([^()]*\b(?:19|20)\d{2}[a-z]?\b[^()]*\)/g;
const YEAR_BLOCK = /\(((?:19|20)\d{2})[a-z]?\)/;
// Awalan di- yang bukan kata kerja pasif.
const NOT_PASSIVE = new Set([
  "dimana",
  "diantara",
  "dibawah",
  "diatas",
  "didalam",
  "diluar",
  "disini",
  "disana",
  "dinas",
  "dinamis",
  "dinamika",
  "diagram",
  "dimensi",
  "disiplin",
  "diskusi",
  "distribusi",
  "digital",
  "diri",
  "diet",
  "diameter",
  "diagnosis",
]);

const wordCount = (text: string): number => (text.match(WORD) ?? []).length;
const round1 = (n: number): number => Math.round(n * 10) / 10;

export function computeStats(doc: ParsedDocument, rules: Rules): ManuscriptStats {
  const body = bodyParagraphs(doc);

  const chapters: ChapterStat[] = chapterRanges(doc, rules.required_sections).map((r) => {
    const text = doc.paragraphs
      .filter((p) => p.index >= r.start && p.index < r.end && !p.isToc)
      .map((p) => p.text);
    return {
      name: r.name,
      words: text.reduce((n, t) => n + wordCount(t), 0),
      citations: text.reduce((n, t) => n + (t.match(CITE) ?? []).length, 0),
    };
  });

  let sentences = 0;
  let sentenceWords = 0;
  let longSentences = 0;
  let passive = 0;
  for (const p of body) {
    for (const s of p.text.split(/(?<=[.!?])\s+/)) {
      const n = wordCount(s);
      if (n < 3) continue;
      sentences++;
      sentenceWords += n;
      if (n > rules.max_sentence_words) longSentences++;
      const tokens = s.toLowerCase().match(WORD) ?? [];
      if (tokens.some((w) => /^di[a-z]{4,}$/.test(w) && !NOT_PASSIVE.has(w))) passive++;
    }
  }

  const bib = findSections(doc, ["DAFTAR PUSTAKA"]).get("DAFTAR PUSTAKA");
  const years: number[] = [];
  if (bib) {
    for (const p of doc.paragraphs) {
      if (p.index <= bib.index || p.isToc || p.text.trim() === "") continue;
      const m = YEAR_BLOCK.exec(p.text);
      if (m) years.push(Number(m[1]));
    }
  }
  years.sort((a, b) => a - b);
  const thisYear = new Date().getUTCFullYear();
  const recent = years.filter((y) => thisYear - y <= rules.citation.max_source_age_years).length;

  return {
    words: doc.wordCount,
    paragraphs: body.length,
    tables: doc.tableCount,
    figures: doc.paragraphs.filter((p) => p.hasDrawing && (p.imageWidthCm ?? 99) >= 3).length,
    footnotes: doc.footnoteCount,
    chapters,
    readability: {
      sentences,
      avgSentenceWords: sentences ? round1(sentenceWords / sentences) : 0,
      longSentencePct: sentences ? round1((longSentences / sentences) * 100) : 0,
      passivePct: sentences ? round1((passive / sentences) * 100) : 0,
    },
    sources: {
      total: years.length,
      recentPct: years.length ? Math.round((recent / years.length) * 100) : null,
      medianYear: years.length ? years[Math.floor(years.length / 2)]! : null,
    },
  };
}
