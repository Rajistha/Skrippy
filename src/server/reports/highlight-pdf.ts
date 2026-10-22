/**
 * Naskah bersorot sebagai PDF. Murni: data masuk, bytes keluar.
 * Tanpa LibreOffice halaman Word tidak bisa dirender, jadi PDF ini menyusun ulang teks naskah (font Times, A4)
 * dengan sorotan di teks bermasalah. Tata letak aslinya (margin, spasi, gambar, tabel) tidak dipertahankan;
 * untuk itu pakai unduhan .docx yang dirapikan.
 *
 * Seperti laporan kemiripan, PDF ini menampilkan persentase: bagian teks naskah yang tersorot (bermasalah),
 * di pita awal, di kaki setiap halaman, dan pada ringkasan di halaman terakhir.
 */
import { PDFDocument, type PDFPage } from "pdf-lib";
import {
  COLOR,
  PAGE,
  SEVERITY_INK,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  SEVERITY_SOFT,
  drawBar,
  drawCoverBand,
  drawFooters,
  drawPill,
  embedFonts,
  formatWib,
  makeClean,
  roundRect,
  text,
  wrapText,
  type Severity,
} from "./pdf-kit";

export type HighlightSeverity = Severity;

export type HighlightParagraph = {
  index: number;
  text: string;
  kind: "heading" | "body" | "toc";
  align: "left" | "center" | "right" | "justify";
};

export type HighlightIssue = {
  severity: HighlightSeverity;
  ruleCode: string;
  message: string;
  suggestion: string | null;
  excerpt: string | null;
  /** Null: temuan berlaku untuk seluruh naskah. */
  paragraphIndex: number | null;
};

export type HighlightPdfInput = {
  title: string;
  versionNo: number;
  generatedAt: Date;
  paragraphs: HighlightParagraph[];
  issues: HighlightIssue[];
};

const BODY = { size: 11.5, leading: 16.5 };
const NOTE = { size: 8.5, leading: 11.5 };
const RANK: Record<HighlightSeverity, number> = { critical: 3, major: 2, minor: 1 };
const FROM_RANK: HighlightSeverity[] = ["minor", "major", "critical"];

const trimEllipsis = (s: string): string => s.replace(/^[….\s]+|[….\s]+$/g, "");

/** Teks yang dipakai untuk mencocokkan kutipan: spasi dirapatkan dan diberi `clean`, sama dengan yang digambar. */
const normalize = (s: string, clean: (s: string) => string): string => clean(s).trim();

/** Rentang sorotan satu paragraf. Kutipan yang tidak ketemu menyorot seluruh paragraf. */
function rangesOf(
  text: string,
  issues: HighlightIssue[],
  clean: (s: string) => string,
): {
  ranges: { start: number; end: number; severity: HighlightSeverity }[];
  whole: HighlightSeverity | null;
} {
  const ranges: { start: number; end: number; severity: HighlightSeverity }[] = [];
  let whole: HighlightSeverity | null = null;
  for (const i of issues) {
    const needle = i.excerpt ? normalize(trimEllipsis(i.excerpt), clean) : "";
    const at = needle.length >= 3 ? text.indexOf(needle) : -1;
    if (at >= 0) ranges.push({ start: at, end: at + needle.length, severity: i.severity });
    else if (whole === null || RANK[i.severity] > RANK[whole]) whole = i.severity;
  }
  return { ranges, whole };
}

export type FlaggedShare = {
  /** Persentase karakter teks (judul dan isi, tanpa daftar isi) yang tersorot, 0-100. */
  percent: number;
  /** Bagian dari seluruh teks menurut tingkat terparah di tiap karakter, 0-100. */
  bySeverity: Record<HighlightSeverity, number>;
  totalChars: number;
  flaggedChars: number;
};

/** Hitung persentase teks yang tersorot. Murni agar mudah diuji. */
export function computeFlaggedShare(
  input: Pick<HighlightPdfInput, "paragraphs" | "issues">,
  clean: (s: string) => string = (s) => s,
): FlaggedShare {
  const byParagraph = new Map<number, HighlightIssue[]>();
  for (const i of input.issues) {
    if (i.paragraphIndex === null) continue;
    byParagraph.set(i.paragraphIndex, [...(byParagraph.get(i.paragraphIndex) ?? []), i]);
  }
  let total = 0;
  const counts = { critical: 0, major: 0, minor: 0 };
  for (const p of input.paragraphs) {
    if (p.kind === "toc") continue;
    const text = normalize(p.text, clean);
    if (text === "") continue;
    total += text.length;
    const issues = byParagraph.get(p.index);
    if (!issues) continue;
    const { ranges, whole } = rangesOf(text, issues, clean);
    const rank = new Array<number>(text.length).fill(whole ? RANK[whole] : 0);
    for (const r of ranges) {
      for (let c = r.start; c < Math.min(r.end, text.length); c++) {
        rank[c] = Math.max(rank[c]!, RANK[r.severity]);
      }
    }
    for (const v of rank) if (v > 0) counts[FROM_RANK[v - 1]!]++;
  }
  const flagged = counts.critical + counts.major + counts.minor;
  const pct = (n: number): number => (total === 0 ? 0 : (n / total) * 100);
  return {
    percent: pct(flagged),
    bySeverity: {
      critical: pct(counts.critical),
      major: pct(counts.major),
      minor: pct(counts.minor),
    },
    totalChars: total,
    flaggedChars: flagged,
  };
}

/** 12,4% (satu desimal, koma Indonesia); di bawah 0,1% yang tidak nol ditulis "<0,1%". */
export const formatPercent = (v: number): string =>
  v > 0 && v < 0.05 ? "<0,1%" : `${v.toFixed(1).replace(".", ",")}%`;

export async function buildHighlightPdf(input: HighlightPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Naskah Bersorot Skrippy: ${input.title}`.slice(0, 200));
  pdf.setProducer("Skrippy");
  pdf.setCreator("Skrippy");
  const fonts = await embedFonts(pdf);
  const { sans, sansBold, serif, serifBold } = fonts;
  const clean = makeClean(serif);
  const share = computeFlaggedShare(input, clean);

  const byParagraph = new Map<number, HighlightIssue[]>();
  const loose: HighlightIssue[] = [];
  for (const i of input.issues) {
    if (i.paragraphIndex === null) loose.push(i);
    else byParagraph.set(i.paragraphIndex, [...(byParagraph.get(i.paragraphIndex) ?? []), i]);
  }

  let page: PDFPage = pdf.addPage([PAGE.w, PAGE.h]);
  const contentW = PAGE.w - PAGE.margin * 2;
  const ensure = (height: number): void => {
    if (y - height < PAGE.margin + 14) {
      page = pdf.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - PAGE.margin;
    }
  };
  let y = drawCoverBand(page, fonts, clean, {
    kind: "Naskah Bersorot",
    title: input.title,
    meta: `Versi ${input.versionNo}  ·  Dibuat ${formatWib(input.generatedAt)}`,
  });

  // Lajur ringkas: keterangan warna di kiri, persentase teks bermasalah di kanan.
  roundRect(page, PAGE.margin, y, contentW, 40, 10, COLOR.primary50);
  let lx = PAGE.margin + 14;
  for (const sev of SEVERITY_ORDER) {
    page.drawRectangle({ x: lx, y: y - 25, width: 14, height: 9, color: SEVERITY_SOFT[sev] });
    text(page, SEVERITY_LABEL[sev], lx + 19, y - 24, sans, 9, COLOR.ink900);
    lx += 19 + sans.widthOfTextAtSize(SEVERITY_LABEL[sev], 9) + 16;
  }
  const badge = `Teks bermasalah ${formatPercent(share.percent)}`;
  const bw = sansBold.widthOfTextAtSize(badge, 10) + 22;
  roundRect(page, PAGE.margin + contentW - bw - 10, y - 9, bw, 22, 11, COLOR.primary800);
  text(page, badge, PAGE.margin + contentW - bw + 1, y - 24, sansBold, 10, COLOR.white);
  y -= 40 + 20;

  for (const p of input.paragraphs) {
    const body = normalize(p.text, clean);
    if (body === "") continue;
    const issues = byParagraph.get(p.index) ?? [];
    const font = p.kind === "heading" ? serifBold : serif;
    const color = p.kind === "toc" ? COLOR.ink500 : COLOR.ink900;
    const lines = wrapLines(body, font, BODY.size, contentW);

    const { ranges, whole: wholeSeverity } = rangesOf(body, issues, clean);
    const paragraphSeverity = issues.reduce<HighlightSeverity | null>(
      (w, i) => (w === null || RANK[i.severity] > RANK[w] ? i.severity : w),
      null,
    );

    ensure(BODY.leading * Math.min(lines.length, 3));
    y -= 4;
    for (const line of lines) {
      ensure(BODY.leading);
      const baseline = y - BODY.size;
      const width = font.widthOfTextAtSize(line.text, BODY.size);
      const offset =
        p.align === "center" ? (contentW - width) / 2 : p.align === "right" ? contentW - width : 0;
      const x0 = PAGE.margin + Math.max(0, offset);
      if (wholeSeverity) {
        page.drawRectangle({
          x: x0 - 1,
          y: baseline - 3.5,
          width: width + 2,
          height: BODY.leading - 1,
          color: SEVERITY_SOFT[wholeSeverity],
          opacity: 0.45,
        });
      }
      for (const r of ranges) {
        const from = Math.max(r.start, line.start);
        const to = Math.min(r.end, line.start + line.text.length);
        if (to <= from) continue;
        const before = font.widthOfTextAtSize(line.text.slice(0, from - line.start), BODY.size);
        const inside = font.widthOfTextAtSize(
          line.text.slice(from - line.start, to - line.start),
          BODY.size,
        );
        page.drawRectangle({
          x: x0 + before - 0.5,
          y: baseline - 3.5,
          width: inside + 1,
          height: BODY.leading - 1,
          color: SEVERITY_SOFT[r.severity],
          opacity: 0.8,
        });
      }
      if (paragraphSeverity) {
        // Penanda di tepi kiri, warna tingkat terparah di paragraf ini.
        page.drawRectangle({
          x: PAGE.margin - 9,
          y: baseline - 3.5,
          width: 3,
          height: BODY.leading,
          color: SEVERITY_INK[paragraphSeverity],
        });
      }
      page.drawText(line.text, { x: x0, y: baseline, size: BODY.size, font, color });
      y -= BODY.leading;
    }
    // Catatan temuan tepat di bawah paragraf.
    for (const i of issues) {
      const head = `[${SEVERITY_LABEL[i.severity]}] ${i.ruleCode}: `;
      const note = clean(`${i.message}${i.suggestion ? ` Saran: ${i.suggestion}` : ""}`);
      const headW = sansBold.widthOfTextAtSize(head, NOTE.size);
      const noteLines = wrapText(note, sans, NOTE.size, contentW - 12 - headW);
      ensure(NOTE.leading * noteLines.length + 2);
      noteLines.forEach((nl, k) => {
        const baseline = y - NOTE.size;
        if (k === 0)
          page.drawText(head, {
            x: PAGE.margin + 12,
            y: baseline,
            size: NOTE.size,
            font: sansBold,
            color: SEVERITY_INK[i.severity],
          });
        page.drawText(nl, {
          x: PAGE.margin + 12 + headW,
          y: baseline,
          size: NOTE.size,
          font: sans,
          color: SEVERITY_INK[i.severity],
        });
        y -= NOTE.leading;
      });
    }
    y -= p.kind === "heading" ? 6 : 4;
  }

  if (loose.length > 0) {
    ensure(60);
    y -= 10;
    drawPill(
      page,
      fonts,
      PAGE.margin,
      y,
      "TEMUAN UNTUK SELURUH NASKAH",
      COLOR.white,
      COLOR.primary500,
    );
    y -= 28;
    for (const i of loose) {
      const head = `[${SEVERITY_LABEL[i.severity]}] ${i.ruleCode}: `;
      const headW = sansBold.widthOfTextAtSize(head, NOTE.size + 1);
      const noteLines = wrapText(clean(i.message), sans, NOTE.size + 1, contentW - headW);
      ensure(NOTE.leading * noteLines.length + 4);
      noteLines.forEach((nl, k) => {
        const baseline = y - NOTE.size;
        if (k === 0)
          page.drawText(head, {
            x: PAGE.margin,
            y: baseline,
            size: NOTE.size + 1,
            font: sansBold,
            color: SEVERITY_INK[i.severity],
          });
        page.drawText(nl, {
          x: PAGE.margin + headW,
          y: baseline,
          size: NOTE.size + 1,
          font: sans,
          color: COLOR.ink900,
        });
        y -= NOTE.leading;
      });
      y -= 3;
    }
  }

  // Ringkasan akhir: persentase besar dan rinciannya per keparahan.
  ensure(150);
  y -= 16;
  const panelH = 128;
  roundRect(page, PAGE.margin, y, contentW, panelH, 12, COLOR.primary50);
  text(page, "RINGKASAN", PAGE.margin + 18, y - 22, sansBold, 8, COLOR.ink500);
  text(
    page,
    formatPercent(share.percent),
    PAGE.margin + 18,
    y - 62,
    sansBold,
    30,
    COLOR.primary800,
  );
  const caption = wrapText("teks naskah tersorot sebagai bermasalah", sans, 8.5, 130);
  caption.forEach((c, k) =>
    text(page, c, PAGE.margin + 18, y - 80 - k * 11, sans, 8.5, COLOR.ink500),
  );
  const colX = PAGE.margin + 190;
  const barX = colX + 56;
  const barW = PAGE.margin + contentW - 70 - barX;
  SEVERITY_ORDER.forEach((s, k) => {
    const rowTop = y - 34 - k * 26;
    text(page, SEVERITY_LABEL[s], colX, rowTop - 10, sansBold, 9.5, SEVERITY_INK[s]);
    drawBar(
      page,
      barX,
      rowTop - 4,
      barW,
      8,
      share.percent > 0 ? (share.bySeverity[s] / share.percent) * 100 : 0,
      SEVERITY_INK[s],
    );
    const v = formatPercent(share.bySeverity[s]);
    text(
      page,
      v,
      PAGE.margin + contentW - 14 - sansBold.widthOfTextAtSize(v, 9.5),
      rowTop - 10,
      sansBold,
      9.5,
      COLOR.ink900,
    );
  });
  y -= panelH + 8;
  text(
    page,
    "Persentase dihitung dari jumlah karakter judul dan isi (tanpa daftar isi). Ini indikator, bukan penilaian resmi.",
    PAGE.margin,
    y - 8,
    fonts.sansItalic,
    7.5,
    COLOR.ink500,
  );

  drawFooters(
    pdf,
    fonts,
    `Teks bermasalah ${formatPercent(share.percent)}  ·  Versi ${input.versionNo}`,
  );
  return pdf.save();
}

/** Seperti wrapText, tetapi mengembalikan juga posisi awal tiap baris di teks (untuk menempatkan sorotan). */
function wrapLines(
  body: string,
  font: Parameters<typeof wrapText>[1],
  size: number,
  width: number,
): { text: string; start: number }[] {
  const lines: { text: string; start: number }[] = [];
  let line = "";
  let lineStart = 0;
  let pos = 0;
  for (const word of body.split(" ")) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (line !== "" && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push({ text: line, start: lineStart });
      lineStart = pos;
      line = word;
    } else line = candidate;
    pos += word.length + 1;
  }
  lines.push({ text: line, start: lineStart });
  return lines;
}
