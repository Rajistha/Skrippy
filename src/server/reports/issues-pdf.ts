/**
 * Laporan temuan sebagai PDF (tanpa isi naskah selain kutipan pendek). Murni: data masuk, bytes keluar.
 * Berbeda dari PDF bersorot: ini ringkasan skor dan kartu temuan yang enak dicetak atau dibawa ke dosen.
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
  drawScoreRing,
  embedFonts,
  formatWib,
  makeClean,
  roundRect,
  text,
  wrapText,
  type Severity,
} from "./pdf-kit";

export type IssuesPdfSeverity = Severity;

export type IssuesPdfItem = {
  severity: IssuesPdfSeverity;
  ruleCode: string;
  categoryLabel: string;
  message: string;
  suggestion: string | null;
  excerpt: string | null;
  /** Teks letak yang sudah jadi, misalnya "BAB II > 2.1, paragraf 14". Kosong bila berlaku untuk seluruh naskah. */
  location: string;
};

export type IssuesPdfInput = {
  title: string;
  versionNo: number;
  generatedAt: Date;
  scoreTotal: number | null;
  categoryScores: { label: string; score: number }[];
  issues: IssuesPdfItem[];
};

const SIZE = 9.5;
const LEADING = 13;
const CARD_PAD = 10;
const STRIPE = 3;

export async function buildIssuesPdf(input: IssuesPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Laporan Temuan Skrippy: ${input.title}`.slice(0, 200));
  pdf.setProducer("Skrippy");
  pdf.setCreator("Skrippy");
  const fonts = await embedFonts(pdf);
  const clean = makeClean(fonts.sans);

  const contentW = PAGE.w - PAGE.margin * 2;
  let page: PDFPage = pdf.addPage([PAGE.w, PAGE.h]);
  let y = drawCoverBand(page, fonts, clean, {
    kind: "Laporan Temuan",
    title: input.title,
    meta: `Versi ${input.versionNo}  ·  Dibuat ${formatWib(input.generatedAt)}`,
  });
  const ensure = (height: number): void => {
    if (y - height < PAGE.margin + 14) {
      page = pdf.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - PAGE.margin;
    }
  };

  const counts = SEVERITY_ORDER.map((s) => ({
    s,
    n: input.issues.filter((i) => i.severity === s).length,
  }));

  // Kartu ringkasan: cincin skor di kiri, jumlah temuan dan skor kategori di kanan.
  const cardH = Math.max(150, 78 + input.categoryScores.length * 17);
  roundRect(page, PAGE.margin, y, contentW, cardH, 12, COLOR.primary50);
  const ringR = 38;
  const ringCx = PAGE.margin + 24 + ringR + 8;
  drawScoreRing(
    page,
    fonts,
    ringCx,
    y - cardH / 2 + 4,
    ringR,
    input.scoreTotal ?? 0,
    input.scoreTotal === null ? "tanpa skor" : "skor dari 100",
  );
  const colX = ringCx + ringR + 36;
  text(page, "RINGKASAN TEMUAN", colX, y - 22, fonts.sansBold, 8, COLOR.ink500);
  let px = colX;
  for (const { s, n } of counts) {
    px +=
      drawPill(
        page,
        fonts,
        px,
        y - 30,
        `${n} ${SEVERITY_LABEL[s]}`,
        SEVERITY_INK[s],
        SEVERITY_SOFT[s],
      ) + 6;
  }
  if (input.categoryScores.length > 0) {
    text(page, "SKOR PER KATEGORI", colX, y - 66, fonts.sansBold, 8, COLOR.ink500);
    const barX = colX + 86;
    const barW = PAGE.margin + contentW - 52 - barX;
    input.categoryScores.forEach((c, i) => {
      const rowTop = y - 76 - i * 17;
      text(page, clean(c.label), colX, rowTop - 9, fonts.sans, 9, COLOR.ink900);
      drawBar(page, barX, rowTop - 3, barW, 7, c.score, COLOR.primary500);
      const v = String(Math.round(c.score));
      text(
        page,
        v,
        PAGE.margin + contentW - 14 - fonts.sansBold.widthOfTextAtSize(v, 9),
        rowTop - 9,
        fonts.sansBold,
        9,
        COLOR.ink900,
      );
    });
  }
  y -= cardH + 10;
  const note =
    "Skor adalah indikator, bukan penilaian resmi. Periksa setiap temuan dengan pedoman kampusmu.";
  text(page, note, PAGE.margin, y - 8, fonts.sansItalic, 8, COLOR.ink500);
  y -= 26;

  if (input.issues.length === 0) {
    ensure(40);
    roundRect(page, PAGE.margin, y, contentW, 40, 10, COLOR.primary100);
    text(
      page,
      "Tidak ada temuan terbuka. Naskahmu sudah sesuai pemeriksaan ini.",
      PAGE.margin + 14,
      y - 24,
      fonts.sansBold,
      10,
      COLOR.primary800,
    );
    y -= 50;
  }

  let k = 0; // nomor urut berlanjut lintas kelompok
  // Temuan dikelompokkan menurut keparahan, terparah dulu; urutan asli dipertahankan di dalam kelompok.
  for (const { s, n } of counts) {
    if (n === 0) continue;
    ensure(60);
    drawPill(
      page,
      fonts,
      PAGE.margin,
      y,
      `${SEVERITY_LABEL[s].toUpperCase()}  ·  ${n} temuan`,
      COLOR.white,
      SEVERITY_INK[s],
    );
    y -= 28;

    for (const i of input.issues.filter((x) => x.severity === s)) {
      k++;
      const innerW = contentW - STRIPE - CARD_PAD * 2;
      const message = wrapText(clean(i.message), fonts.sans, SIZE, innerW);
      const suggestion = i.suggestion
        ? wrapText(clean(`Saran: ${i.suggestion}`), fonts.sans, SIZE, innerW)
        : [];
      const excerpt = i.excerpt
        ? wrapText(clean(`"${i.excerpt}"`), fonts.sansItalic, SIZE - 0.5, innerW)
        : [];
      const where = i.location
        ? wrapText(clean(`Letak: ${i.location}`), fonts.sans, SIZE - 1, innerW)
        : [];
      const lines = message.length + suggestion.length + excerpt.length + where.length;
      const height = CARD_PAD * 2 + 16 + lines * LEADING + 2;
      ensure(Math.min(height, PAGE.h - PAGE.margin * 2) + 8);

      roundRect(page, PAGE.margin, y, contentW, height, 8, COLOR.primary50);
      page.drawRectangle({
        x: PAGE.margin,
        y: y - height + 6,
        width: STRIPE,
        height: height - 12,
        color: SEVERITY_INK[s],
      });
      const left = PAGE.margin + STRIPE + CARD_PAD;
      // Baris kepala: kode aturan, kategori, nomor urut.
      const codeW = drawPill(
        page,
        fonts,
        left,
        y - CARD_PAD + 2,
        i.ruleCode,
        SEVERITY_INK[s],
        SEVERITY_SOFT[s],
      );
      text(
        page,
        clean(i.categoryLabel),
        left + codeW + 8,
        y - CARD_PAD - 9,
        fonts.sans,
        8.5,
        COLOR.ink500,
      );
      const num = `#${k}`;
      text(
        page,
        num,
        PAGE.margin + contentW - CARD_PAD - fonts.sansBold.widthOfTextAtSize(num, 8.5),
        y - CARD_PAD - 9,
        fonts.sansBold,
        8.5,
        COLOR.ink500,
      );
      let ly = y - CARD_PAD - 22;
      const put = (
        rows: string[],
        font: typeof fonts.sans,
        size: number,
        color: typeof COLOR.ink900,
      ): void => {
        for (const row of rows) {
          text(page, row, left, ly - size + 2, font, size, color);
          ly -= LEADING;
        }
      };
      put(message, fonts.sansBold, SIZE, COLOR.ink900);
      put(suggestion, fonts.sans, SIZE, COLOR.primary500);
      put(excerpt, fonts.sansItalic, SIZE - 0.5, COLOR.ink500);
      put(where, fonts.sans, SIZE - 1, COLOR.ink500);
      y -= height + 8;
    }
    y -= 6;
  }

  drawFooters(pdf, fonts, `Laporan Temuan  ·  Versi ${input.versionNo}`);
  return pdf.save();
}
