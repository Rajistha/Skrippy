/**
 * Naskah bersorot sebagai PDF. Murni: data masuk, bytes keluar.
 * Tanpa LibreOffice halaman Word tidak bisa dirender, jadi PDF ini menyusun ulang teks naskah (font Times, A4)
 * dengan sorotan di teks bermasalah. Tata letak aslinya (margin, spasi, gambar, tabel) tidak dipertahankan;
 * untuk itu pakai unduhan .docx bersorot.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type HighlightSeverity = "critical" | "major" | "minor";

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
  paragraphs: HighlightParagraph[];
  issues: HighlightIssue[];
};

const PAGE = { w: 595.28, h: 841.89, margin: 56 };
const BODY = { size: 11.5, leading: 16.5 };
const NOTE = { size: 8.5, leading: 11.5 };
const RANK: Record<HighlightSeverity, number> = { critical: 3, major: 2, minor: 1 };
const LABEL: Record<HighlightSeverity, string> = {
  critical: "Kritis",
  major: "Sedang",
  minor: "Ringan",
};
const MARK = {
  critical: rgb(0.99, 0.64, 0.61),
  major: rgb(1, 0.87, 0.54),
  minor: rgb(0.7, 0.8, 1),
};
const INK = {
  critical: rgb(0.7, 0.14, 0.14),
  major: rgb(0.62, 0.42, 0.03),
  minor: rgb(0.16, 0.38, 0.65),
};
const TEXT = rgb(0.1, 0.13, 0.11);
const MUTED = rgb(0.4, 0.46, 0.42);

const trimEllipsis = (s: string): string => s.replace(/^[….\s]+|[….\s]+$/g, "");

export async function buildHighlightPdf(input: HighlightPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Naskah: ${input.title}`.slice(0, 200));
  pdf.setProducer("Skrippy");
  pdf.setCreator("Skrippy");
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Karakter di luar WinAnsi diganti tanda tanya, bukan dibuang diam-diam.
  const encodable = new Set(serif.getCharacterSet());
  const clean = (s: string): string =>
    [...s.replace(/\s+/g, " ")]
      .map((ch) => (encodable.has(ch.codePointAt(0)!) ? ch : "?"))
      .join("");

  const byParagraph = new Map<number, HighlightIssue[]>();
  const loose: HighlightIssue[] = [];
  for (const i of input.issues) {
    if (i.paragraphIndex === null) loose.push(i);
    else byParagraph.set(i.paragraphIndex, [...(byParagraph.get(i.paragraphIndex) ?? []), i]);
  }

  let page: PDFPage = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - PAGE.margin;
  const contentW = PAGE.w - PAGE.margin * 2;
  const ensure = (height: number): void => {
    if (y - height < PAGE.margin) {
      page = pdf.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - PAGE.margin;
    }
  };

  function wrap(
    text: string,
    font: PDFFont,
    size: number,
    width: number,
  ): { text: string; start: number }[] {
    const lines: { text: string; start: number }[] = [];
    let line = "";
    let lineStart = 0;
    let pos = 0;
    for (const word of text.split(" ")) {
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

  // Kepala dokumen dan keterangan warna.
  page.drawText(clean(input.title).slice(0, 90), {
    x: PAGE.margin,
    y: y - 12,
    size: 14,
    font: sansBold,
    color: TEXT,
  });
  y -= 30;
  page.drawText(
    `Laporan naskah · Versi ${input.versionNo} · ${input.issues.length} temuan terbuka`,
    {
      x: PAGE.margin,
      y: y - 8,
      size: 9,
      font: sans,
      color: MUTED,
    },
  );
  y -= 22;
  let lx = PAGE.margin;
  for (const sev of ["critical", "major", "minor"] as const) {
    page.drawRectangle({ x: lx, y: y - 9, width: 14, height: 9, color: MARK[sev] });
    page.drawText(LABEL[sev], { x: lx + 19, y: y - 8, size: 9, font: sans, color: TEXT });
    lx += 19 + sans.widthOfTextAtSize(LABEL[sev], 9) + 18;
  }
  y -= 28;

  for (const p of input.paragraphs) {
    const text = clean(p.text).trim();
    if (text === "") continue;
    const issues = byParagraph.get(p.index) ?? [];
    const font = p.kind === "heading" ? serifBold : serif;
    const color = p.kind === "toc" ? MUTED : TEXT;
    const lines = wrap(text, font, BODY.size, contentW);

    // Rentang sorotan: kutipan yang ketemu; tanpa kutipan yang cocok, seluruh paragraf.
    const ranges: { start: number; end: number; severity: HighlightSeverity }[] = [];
    let wholeSeverity: HighlightSeverity | null = null;
    for (const i of issues) {
      const needle = i.excerpt ? clean(trimEllipsis(i.excerpt)).trim() : "";
      const at = needle.length >= 3 ? text.indexOf(needle) : -1;
      if (at >= 0) ranges.push({ start: at, end: at + needle.length, severity: i.severity });
      else if (wholeSeverity === null || RANK[i.severity] > RANK[wholeSeverity])
        wholeSeverity = i.severity;
    }
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
          color: MARK[wholeSeverity],
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
          color: MARK[r.severity],
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
          color: INK[paragraphSeverity],
        });
      }
      page.drawText(line.text, { x: x0, y: baseline, size: BODY.size, font, color });
      y -= BODY.leading;
    }
    // Catatan temuan tepat di bawah paragraf.
    for (const i of issues) {
      const head = `[${LABEL[i.severity]}] ${i.ruleCode}: `;
      const body = clean(`${i.message}${i.suggestion ? ` Saran: ${i.suggestion}` : ""}`);
      const headW = sansBold.widthOfTextAtSize(head, NOTE.size);
      const noteLines = wrap(body, sans, NOTE.size, contentW - 12 - headW);
      ensure(NOTE.leading * noteLines.length + 2);
      noteLines.forEach((nl, k) => {
        const baseline = y - NOTE.size;
        if (k === 0)
          page.drawText(head, {
            x: PAGE.margin + 12,
            y: baseline,
            size: NOTE.size,
            font: sansBold,
            color: INK[i.severity],
          });
        page.drawText(nl.text, {
          x: PAGE.margin + 12 + headW,
          y: baseline,
          size: NOTE.size,
          font: sans,
          color: INK[i.severity],
        });
        y -= NOTE.leading;
      });
    }
    y -= p.kind === "heading" ? 6 : 4;
  }

  if (loose.length > 0) {
    ensure(60);
    y -= 10;
    page.drawText("Temuan untuk seluruh naskah", {
      x: PAGE.margin,
      y: y - 11,
      size: 11,
      font: sansBold,
      color: TEXT,
    });
    y -= 24;
    for (const i of loose) {
      const head = `[${LABEL[i.severity]}] ${i.ruleCode}: `;
      const headW = sansBold.widthOfTextAtSize(head, NOTE.size + 1);
      const noteLines = wrap(clean(i.message), sans, NOTE.size + 1, contentW - headW);
      ensure(NOTE.leading * noteLines.length + 4);
      noteLines.forEach((nl, k) => {
        const baseline = y - NOTE.size;
        if (k === 0)
          page.drawText(head, {
            x: PAGE.margin,
            y: baseline,
            size: NOTE.size + 1,
            font: sansBold,
            color: INK[i.severity],
          });
        page.drawText(nl.text, {
          x: PAGE.margin + headW,
          y: baseline,
          size: NOTE.size + 1,
          font: sans,
          color: TEXT,
        });
        y -= NOTE.leading;
      });
      y -= 3;
    }
  }

  const pages = pdf.getPages();
  pages.forEach((pg, n) => {
    pg.drawText(`Skrippy · Halaman ${n + 1} dari ${pages.length}`, {
      x: PAGE.margin,
      y: 28,
      size: 8,
      font: sans,
      color: MUTED,
    });
  });
  return pdf.save();
}
