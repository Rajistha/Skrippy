/**
 * Pemeriksa AI (Fase 3): penyusun prompt dan pembaca jawaban. Murni, tanpa I/O dan tanpa memanggil AI,
 * jadi bisa diuji dengan jawaban palsu. Pemanggilan sebenarnya ada di services/ai-check.ts.
 *
 * Prinsip: jawaban model tidak dipercaya. Setiap temuan harus menunjuk paragraf yang ada dan
 * mengutip teks yang benar-benar ada di paragraf itu; selebihnya dibuang.
 */
import { z } from "zod";
import { isHeading, type Issue, type ParsedDocument } from "../types";

export type AiParagraph = { index: number; text: string };

const MIN_PARAGRAPH_CHARS = 40;
const MAX_ISSUES_PER_BATCH = 30;
const BATCH_CHARS = 6000;
const MAX_PARAGRAPH_CHARS = 2500;

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Bagian yang tidak diperiksa tata bahasanya: daftar pustaka dan lampiran berisi data, bukan kalimat penulis. */
const SKIP_SECTION =
  /^(daftar pustaka|daftar referensi|referensi|lampiran|daftar isi|daftar tabel|daftar gambar)\b/i;

/** Paragraf isi yang layak dikirim ke AI, dibatasi total karakter. `truncated` bila ada yang tidak ikut. */
export function selectParagraphs(
  doc: ParsedDocument,
  maxChars: number,
): { paragraphs: AiParagraph[]; truncated: boolean } {
  const out: AiParagraph[] = [];
  let total = 0;
  let skipping = false;
  let truncated = false;
  for (const p of doc.paragraphs) {
    const text = p.text.trim();
    // Judul bagian yang dilewati bisa berupa teks biasa (bukan gaya heading), jadi dikenali dari teksnya.
    if (text.length <= 60 && SKIP_SECTION.test(text)) {
      skipping = true;
      continue;
    }
    if (isHeading(p) || /^BAB\s+[IVX]+\b/i.test(text)) {
      skipping = false;
      continue;
    }
    if (skipping || p.isToc || p.hasDrawing || text.length < MIN_PARAGRAPH_CHARS) continue;
    const clipped = text.slice(0, MAX_PARAGRAPH_CHARS);
    if (total + clipped.length > maxChars) {
      truncated = true;
      break;
    }
    total += clipped.length;
    out.push({ index: p.index, text: clipped });
  }
  return { paragraphs: out, truncated };
}

export function batchParagraphs(
  paragraphs: AiParagraph[],
  batchChars = BATCH_CHARS,
): AiParagraph[][] {
  const batches: AiParagraph[][] = [];
  let current: AiParagraph[] = [];
  let size = 0;
  for (const p of paragraphs) {
    if (current.length > 0 && size + p.text.length > batchChars) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(p);
    size += p.text.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

// --- tata bahasa dan kalimat (AI-001, AI-003) ----------------------------------------------------------

export const GRAMMAR_SYSTEM = `Kamu adalah penyunting bahasa Indonesia untuk skripsi. Periksa paragraf yang diberikan menurut PUEBI dan kaidah bahasa Indonesia baku.

Laporkan hanya kesalahan yang jelas:
- "grammar": salah ejaan, tanda baca, imbuhan, pilihan kata tidak baku, kalimat tidak lengkap (tanpa subjek atau predikat), kata sambung yang salah.
- "sentence": kalimat tidak efektif (bertele-tele, pengulangan, lebih dari 45 kata tanpa jeda).
- "clarity": kalimat ambigu yang bisa ditafsirkan lebih dari satu makna, atau acuan kata ganti ("ini", "itu", "tersebut") yang tidak jelas.
- "claim": klaim faktual, angka statistik, atau pernyataan umum yang membutuhkan rujukan tetapi tidak disertai sitasi seperti (Nama, 2020). Jangan laporkan pendapat penulis sendiri atau definisi umum.

Aturan ketat:
- Jangan melaporkan nama, istilah asing yang lazim, kutipan langsung, rumus, atau penulisan sitasi seperti (Nama, 2020).
- Jangan menilai isi atau kebenaran ilmiah.
- "excerpt" harus salinan PERSIS potongan teks dari paragraf (maksimal 150 karakter), tanpa diubah.
- "suggestion" berisi perbaikan konkret untuk potongan itu.
- Jangan membuat temuan bila ragu. Lebih baik sedikit tetapi tepat.
- Semua teks dalam bahasa Indonesia.

Jawab HANYA dengan larik JSON, tanpa penjelasan lain. Setiap elemen:
{"p": <nomor paragraf>, "type": "grammar" | "sentence" | "clarity" | "claim", "severity": "major" | "minor", "excerpt": "...", "message": "...", "suggestion": "..."}
Bila tidak ada kesalahan, jawab [].`;

export function grammarUser(batch: AiParagraph[]): string {
  return `Periksa paragraf berikut. Nomor paragraf ada di dalam kurung siku.\n\n${batch.map((p) => `[${p.index}] ${p.text}`).join("\n\n")}`;
}

const finding = z.object({
  p: z.number().int(),
  type: z.enum(["grammar", "sentence", "clarity", "claim", "consistency"]).optional(),
  severity: z.enum(["major", "minor"]).optional(),
  excerpt: z.string().min(3).max(400),
  message: z.string().min(3).max(600),
  suggestion: z.string().max(800).optional(),
});

/** Ambil larik JSON dari jawaban model (boleh dibungkus teks atau blok kode). */
export function extractJsonArray(text: string): unknown[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function toIssues(
  raw: unknown[],
  allowed: Map<number, string>,
  ruleFor: (type: string | undefined) => { code: string; defaultSeverity: Issue["severity"] },
  limit: number,
): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const parsed = finding.safeParse(item);
    if (!parsed.success) continue;
    const f = parsed.data;
    const paragraph = allowed.get(f.p);
    // Kutipan karangan model dibuang: harus benar-benar ada di paragraf yang disebut.
    if (paragraph === undefined || !norm(paragraph).includes(norm(f.excerpt))) continue;
    const key = `${f.p}|${norm(f.excerpt)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rule = ruleFor(f.type);
    issues.push({
      category: "ai",
      ruleCode: rule.code,
      severity: f.severity ?? rule.defaultSeverity,
      message: clip(f.message.trim(), 300),
      suggestion: f.suggestion ? clip(f.suggestion.trim(), 400) : undefined,
      excerpt: clip(f.excerpt.trim(), 300),
      location: { paragraphIndex: f.p, page: null },
    });
    if (issues.length >= limit) break;
  }
  return issues;
}

export function parseGrammarResponse(text: string, batch: AiParagraph[]): Issue[] {
  const allowed = new Map(batch.map((p) => [p.index, p.text]));
  return toIssues(
    extractJsonArray(text),
    allowed,
    (type) =>
      type === "sentence"
        ? { code: "AI-003", defaultSeverity: "minor" }
        : type === "clarity"
          ? { code: "AI-004", defaultSeverity: "minor" }
          : type === "claim"
            ? { code: "AI-005", defaultSeverity: "minor" }
            : { code: "AI-001", defaultSeverity: "minor" },
    MAX_ISSUES_PER_BATCH,
  );
}

// --- konsistensi antarbab (AI-002) -----------------------------------------------------------------------

export type ConsistencyContext = {
  problems: AiParagraph[];
  objectives: AiParagraph[];
  conclusions: AiParagraph[];
};

const SECTION_CHARS = 5000;

/** Paragraf di bawah judul yang cocok, sampai judul berikutnya yang sama atau lebih tinggi tingkatnya. */
function sectionUnder(doc: ParsedDocument, match: RegExp, within: RegExp | null): AiParagraph[] {
  const paras = doc.paragraphs;
  let inChapter = within === null;
  let level: number | null = null;
  let active = false;
  const out: AiParagraph[] = [];
  let size = 0;
  for (const p of paras) {
    const text = p.text.trim();
    if (p.isToc) continue;
    const chapterStart = p.isChapterHeading || /^BAB\s+[IVX]+\b/i.test(text);
    if (chapterStart) {
      if (active) active = false;
      if (within) inChapter = within.test(text);
      continue;
    }
    if (!inChapter) continue;
    if (isHeading(p) || (text.length < 80 && match.test(text))) {
      if (match.test(text)) {
        active = true;
        level = p.headingLevel;
        continue;
      }
      if (active && (level === null || p.headingLevel === null || p.headingLevel <= level))
        active = false;
      continue;
    }
    if (active && text.length >= 20 && size < SECTION_CHARS) {
      const clipped = text.slice(0, 1200);
      out.push({ index: p.index, text: clipped });
      size += clipped.length;
    }
  }
  return out;
}

/** Rumusan masalah dan tujuan di BAB I, kesimpulan di bab terakhir. Null bila bagian itu tidak ditemukan. */
export function extractConsistencyContext(doc: ParsedDocument): ConsistencyContext | null {
  const chapters = doc.paragraphs.filter(
    (p) => !p.isToc && (p.isChapterHeading || /^BAB\s+[IVX]+\b/i.test(p.text.trim())),
  );
  if (chapters.length < 2) return null;
  const last = chapters[chapters.length - 1]!.text.trim();
  const problems = sectionUnder(doc, /rumusan masalah|perumusan masalah/i, /^BAB\s+I\b/i);
  const objectives = sectionUnder(doc, /tujuan penelitian|tujuan$/i, /^BAB\s+I\b/i);
  const conclusions = sectionUnder(
    doc,
    /kesimpulan|simpulan/i,
    new RegExp(`^${last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
  );
  if (problems.length === 0 || conclusions.length === 0) return null;
  return { problems, objectives, conclusions };
}

export const CONSISTENCY_SYSTEM = `Kamu adalah dosen pembimbing yang memeriksa konsistensi skripsi. Kamu menerima tiga bagian: rumusan masalah (BAB I), tujuan penelitian (BAB I), dan kesimpulan (bab terakhir).

Cari ketidakkonsistenan yang jelas:
- Rumusan masalah yang tidak dijawab di kesimpulan.
- Tujuan penelitian yang tidak sejalan dengan rumusan masalah.
- Kesimpulan yang membahas hal di luar rumusan masalah.

Aturan ketat:
- Jangan menilai kebenaran ilmiah, hanya kesesuaian antarbagian.
- "p" adalah nomor paragraf tempat masalah paling tepat ditandai (biasanya di kesimpulan atau tujuan).
- "excerpt" harus salinan PERSIS potongan teks dari paragraf itu (maksimal 150 karakter).
- "message" menyebut rumusan atau tujuan mana yang bermasalah. "suggestion" memberi langkah perbaikan.
- Jangan membuat temuan bila ragu.

Jawab HANYA dengan larik JSON. Setiap elemen:
{"p": <nomor paragraf>, "severity": "major" | "minor", "excerpt": "...", "message": "...", "suggestion": "..."}
Bila konsisten, jawab [].`;

export function consistencyUser(ctx: ConsistencyContext): string {
  const block = (title: string, list: AiParagraph[]): string =>
    `## ${title}\n${list.map((p) => `[${p.index}] ${p.text}`).join("\n")}`;
  return [
    block("RUMUSAN MASALAH", ctx.problems),
    block("TUJUAN PENELITIAN", ctx.objectives),
    block("KESIMPULAN", ctx.conclusions),
  ].join("\n\n");
}

export function parseConsistencyResponse(text: string, ctx: ConsistencyContext): Issue[] {
  const allowed = new Map(
    [...ctx.problems, ...ctx.objectives, ...ctx.conclusions].map((p) => [p.index, p.text]),
  );
  return toIssues(
    extractJsonArray(text),
    allowed,
    () => ({ code: "AI-002", defaultSeverity: "major" }),
    10,
  );
}

// --- kualitas abstrak (AI-006) ---------------------------------------------------------------------------

/** Paragraf abstrak: dari judul ABSTRAK sampai judul bagian berikutnya. Null bila tidak ada. */
export function extractAbstract(doc: ParsedDocument): AiParagraph[] | null {
  const out: AiParagraph[] = [];
  let active = false;
  for (const p of doc.paragraphs) {
    const text = p.text.trim();
    if (p.isToc) continue;
    if (text.length <= 40 && /^abstrak\b/i.test(text)) {
      active = true;
      continue;
    }
    if (!active) continue;
    if (
      text.length <= 60 &&
      (/^(kata pengantar|daftar isi|abstract|bab\s+[ivx]+)\b/i.test(text) || isHeading(p))
    )
      break;
    if (text.length >= 40) out.push({ index: p.index, text: text.slice(0, 2500) });
    if (out.length >= 6) break;
  }
  return out.length > 0 ? out : null;
}

export const ABSTRACT_SYSTEM = `Kamu adalah dosen yang menilai abstrak skripsi. Abstrak yang baik memuat lima unsur: latar belakang atau masalah, tujuan penelitian, metode, hasil, dan simpulan.

Laporkan hanya unsur yang jelas hilang:
- "p" adalah nomor paragraf abstrak tempat unsur itu seharusnya ditambahkan (pilih paragraf terakhir bila ragu).
- "excerpt" harus salinan PERSIS potongan teks dari paragraf itu (maksimal 150 karakter).
- "message" menyebut unsur yang hilang. "suggestion" memberi contoh satu kalimat yang bisa ditambahkan, tanpa mengarang angka atau hasil.
- Jangan menilai kebenaran ilmiah dan jangan membuat temuan bila ragu.

Jawab HANYA dengan larik JSON. Setiap elemen:
{"p": <nomor paragraf>, "severity": "major" | "minor", "excerpt": "...", "message": "...", "suggestion": "..."}
Bila abstrak lengkap, jawab [].`;

export function abstractUser(paragraphs: AiParagraph[]): string {
  return `Abstrak:\n${paragraphs.map((p) => `[${p.index}] ${p.text}`).join("\n")}`;
}

export function parseAbstractResponse(text: string, paragraphs: AiParagraph[]): Issue[] {
  const allowed = new Map(paragraphs.map((p) => [p.index, p.text]));
  return toIssues(
    extractJsonArray(text),
    allowed,
    () => ({ code: "AI-006", defaultSeverity: "minor" }),
    5,
  );
}

// --- kesesuaian tujuan, metode, dan hasil (AI-007) -------------------------------------------------------

export type AlignmentContext = {
  objectives: AiParagraph[];
  method: AiParagraph[];
  results: AiParagraph[];
};

/** Paragraf sebuah bab (BAB III atau IV), dibatasi panjangnya. */
function chapterParagraphs(doc: ParsedDocument, roman: string): AiParagraph[] {
  const start = new RegExp(`^BAB\\s+${roman}\\b`, "i");
  const out: AiParagraph[] = [];
  let active = false;
  let size = 0;
  for (const p of doc.paragraphs) {
    const text = p.text.trim();
    if (p.isToc) continue;
    if (text.length < 80 && /^BAB\s+[IVX]+\b/i.test(text)) {
      active = start.test(text);
      continue;
    }
    if (!active || isHeading(p) || text.length < 60 || size >= 3500) continue;
    const clipped = text.slice(0, 900);
    out.push({ index: p.index, text: clipped });
    size += clipped.length;
  }
  return out;
}

export function extractAlignmentContext(doc: ParsedDocument): AlignmentContext | null {
  const objectives = sectionUnder(doc, /tujuan penelitian|tujuan$/i, /^BAB\s+I\b/i);
  const method = chapterParagraphs(doc, "III");
  const results = chapterParagraphs(doc, "IV");
  if (objectives.length === 0 || method.length === 0 || results.length === 0) return null;
  return { objectives, method, results };
}

export const ALIGNMENT_SYSTEM = `Kamu adalah dosen penguji yang memeriksa kesesuaian antarbagian skripsi. Kamu menerima tujuan penelitian (BAB I), cuplikan metode (BAB III), dan cuplikan hasil serta pembahasan (BAB IV).

Cari ketidaksesuaian yang jelas:
- Metode atau teknik analisis yang tidak mampu menjawab tujuan penelitian.
- Tujuan penelitian yang tidak punya hasil atau pembahasan yang sepadan di BAB IV.
- Hasil yang dilaporkan tanpa penjelasan atau pembahasan.

Aturan ketat:
- Jangan menilai kebenaran ilmiah atau kualitas data, hanya keselarasan antarbagian.
- "p" adalah nomor paragraf tempat masalah paling tepat ditandai.
- "excerpt" harus salinan PERSIS potongan teks dari paragraf itu (maksimal 150 karakter).
- "message" menyebut tujuan, metode, atau hasil yang tidak selaras. "suggestion" memberi langkah perbaikan.
- Jangan membuat temuan bila ragu.

Jawab HANYA dengan larik JSON. Setiap elemen:
{"p": <nomor paragraf>, "severity": "major" | "minor", "excerpt": "...", "message": "...", "suggestion": "..."}
Bila selaras, jawab [].`;

export function alignmentUser(ctx: AlignmentContext): string {
  const block = (title: string, list: AiParagraph[]): string =>
    `## ${title}\n${list.map((p) => `[${p.index}] ${p.text}`).join("\n")}`;
  return [
    block("TUJUAN PENELITIAN", ctx.objectives),
    block("METODE (BAB III)", ctx.method),
    block("HASIL DAN PEMBAHASAN (BAB IV)", ctx.results),
  ].join("\n\n");
}

export function parseAlignmentResponse(text: string, ctx: AlignmentContext): Issue[] {
  const allowed = new Map(
    [...ctx.objectives, ...ctx.method, ...ctx.results].map((p) => [p.index, p.text]),
  );
  return toIssues(
    extractJsonArray(text),
    allowed,
    () => ({ code: "AI-007", defaultSeverity: "major" }),
    8,
  );
}

// --- kelengkapan entri daftar pustaka (AI-009) -------------------------------------------------------------

/** Entri daftar pustaka, dibatasi jumlah dan panjangnya. Null bila daftar pustaka tidak ditemukan. */
export function extractBibliographyEntries(doc: ParsedDocument): AiParagraph[] | null {
  const out: AiParagraph[] = [];
  let active = false;
  let size = 0;
  for (const p of doc.paragraphs) {
    const text = p.text.trim();
    if (p.isToc) continue;
    if (text.length <= 40 && /^(daftar pustaka|daftar referensi|referensi)$/i.test(text)) {
      active = true;
      continue;
    }
    if (!active) continue;
    if (text.length <= 40 && /^(lampiran|bab\s+[ivx]+)\b/i.test(text)) break;
    if (text.length < 20) continue;
    if (out.length >= 60 || size >= 9000) break;
    const clipped = text.slice(0, 400);
    out.push({ index: p.index, text: clipped });
    size += clipped.length;
  }
  return out.length > 0 ? out : null;
}

export const BIBLIOGRAPHY_SYSTEM = `Kamu adalah pustakawan yang memeriksa daftar pustaka skripsi bergaya APA. Kamu menerima entri daftar pustaka, satu per paragraf.

Laporkan hanya entri yang jelas bermasalah:
- unsur wajib hilang: penulis, tahun, judul, atau sumber (penerbit, nama jurnal, atau URL)
- urutan unsur salah atau pemisah salah (titik, koma, kurung)
- jenis sumber tidak jelas sehingga tidak bisa ditelusuri

Aturan ketat:
- Jangan menilai kualitas atau kebenaran sumber, dan jangan mengarang data sumber yang tidak ada.
- "p" adalah nomor paragraf entri tersebut.
- "excerpt" harus salinan PERSIS potongan teks dari entri itu (maksimal 150 karakter).
- "message" menyebut unsur yang bermasalah. "suggestion" menyebut cara memperbaiki, tanpa mengisi data yang tidak ada di entri.
- Jangan membuat temuan bila ragu.

Jawab HANYA dengan larik JSON. Setiap elemen:
{"p": <nomor paragraf>, "severity": "major" | "minor", "excerpt": "...", "message": "...", "suggestion": "..."}
Bila semua entri baik, jawab [].`;

export function bibliographyUser(entries: AiParagraph[]): string {
  return `Daftar pustaka:\n${entries.map((p) => `[${p.index}] ${p.text}`).join("\n")}`;
}

export function parseBibliographyResponse(text: string, entries: AiParagraph[]): Issue[] {
  const allowed = new Map(entries.map((p) => [p.index, p.text]));
  return toIssues(
    extractJsonArray(text),
    allowed,
    () => ({ code: "AI-009", defaultSeverity: "minor" }),
    15,
  );
}
