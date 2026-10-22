/**
 * Komponen gambar bersama untuk PDF laporan (logo, header, gauge skor, footer). Murni, hanya memakai pdf-lib.
 * Warna mengikuti token di docs/DESIGN.md; font memakai font standar PDF (Helvetica, Times) agar tanpa berkas font.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

export const PAGE = { w: 595.28, h: 841.89, margin: 48 };

/** Token DESIGN.md (heksadesimal 0-1). */
export const COLOR = {
  primary50: rgb(0.933, 0.973, 0.949),
  primary100: rgb(0.851, 0.941, 0.886),
  primary200: rgb(0.698, 0.878, 0.776),
  primary500: rgb(0.122, 0.478, 0.306),
  primary800: rgb(0.063, 0.263, 0.169),
  primary900: rgb(0.043, 0.184, 0.118),
  accent300: rgb(0.561, 0.867, 0.694),
  ink900: rgb(0.1, 0.13, 0.11),
  ink500: rgb(0.4, 0.46, 0.42),
  ink200: rgb(0.85, 0.88, 0.86),
  white: rgb(1, 1, 1),
};

export type Severity = "critical" | "major" | "minor";
export const SEVERITY_ORDER: Severity[] = ["critical", "major", "minor"];
export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Kritis",
  major: "Sedang",
  minor: "Ringan",
};
/** Warna teks dan penanda per keparahan (token sev-*). */
export const SEVERITY_INK: Record<Severity, RGB> = {
  critical: rgb(0.7, 0.14, 0.14),
  major: rgb(0.62, 0.42, 0.03),
  minor: rgb(0.16, 0.38, 0.65),
};
/** Latar lembut per keparahan, dipakai untuk sorotan dan pil. */
export const SEVERITY_SOFT: Record<Severity, RGB> = {
  critical: rgb(0.99, 0.64, 0.61),
  major: rgb(1, 0.87, 0.54),
  minor: rgb(0.7, 0.8, 1),
};

export type Fonts = {
  sans: PDFFont;
  sansBold: PDFFont;
  sansItalic: PDFFont;
  serif: PDFFont;
  serifBold: PDFFont;
};

export async function embedFonts(pdf: PDFDocument): Promise<Fonts> {
  return {
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansBold: await pdf.embedFont(StandardFonts.HelveticaBold),
    sansItalic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
  };
}

/** Karakter di luar WinAnsi diganti tanda tanya, bukan dibuang diam-diam. */
export function makeClean(font: PDFFont): (s: string) => string {
  const encodable = new Set(font.getCharacterSet());
  return (s) =>
    [...s.replace(/\s+/g, " ")]
      .map((ch) => (encodable.has(ch.codePointAt(0)!) ? ch : "?"))
      .join("");
}

/** Pecah teks menjadi baris selebar `width`; kata yang terlalu panjang dipotong agar tidak keluar halaman. */
export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    let w = word;
    while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
      let cut = w.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
      if (line !== "") {
        lines.push(line);
        line = "";
      }
      lines.push(w.slice(0, cut));
      w = w.slice(cut);
    }
    const candidate = line === "" ? w : `${line} ${w}`;
    if (line !== "" && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(line);
      line = w;
    } else line = candidate;
  }
  lines.push(line);
  return lines;
}

/** Tanggal dan jam dalam WIB untuk ditampilkan (waktu disimpan UTC). */
export function formatWib(date: Date): string {
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}.${get("minute")} WIB`;
}

/** Persegi panjang bersudut membulat. `top` adalah sisi atas (koordinat PDF, y naik). */
export function roundRect(
  page: PDFPage,
  x: number,
  top: number,
  w: number,
  h: number,
  r: number,
  color: RGB,
  opacity = 1,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  const path =
    `M ${rr} 0 H ${w - rr} Q ${w} 0 ${w} ${rr} V ${h - rr} Q ${w} ${h} ${w - rr} ${h} ` +
    `H ${rr} Q 0 ${h} 0 ${h - rr} V ${rr} Q 0 0 ${rr} 0 Z`;
  page.drawSvgPath(path, { x, y: top, color, opacity, borderWidth: 0 });
}

/** Teks dengan lebar terukur, rata kiri pada `x` dan garis dasar `baseline`. */
export function text(
  page: PDFPage,
  value: string,
  x: number,
  baseline: number,
  font: PDFFont,
  size: number,
  color: RGB,
): number {
  page.drawText(value, { x, y: baseline, size, font, color });
  return font.widthOfTextAtSize(value, size);
}

/** Logomark Skrippy (huruf S satu goresan dengan titik mint) di kotak hijau. `top` = sisi atas kotak. */
export function drawLogoMark(page: PDFPage, x: number, top: number, size: number): void {
  roundRect(page, x, top, size, size, size * 0.28, COLOR.primary500);
  const k = size / 32;
  page.drawSvgPath(
    "M21 12C21 10 18.8 9 16 9c-3 0-5 1.3-5 3.5 0 2.4 2.2 3.2 5 4s5 1.6 5 4c0 2.2-2 3.5-5 3.5-2.8 0-5-1-5-3",
    {
      x,
      y: top,
      scale: k,
      borderColor: COLOR.white,
      borderWidth: 2.4,
      borderLineCap: 1,
    },
  );
  page.drawCircle({
    x: x + 23.5 * k,
    y: top - 8.5 * k,
    size: 1.9 * k,
    color: COLOR.accent300,
  });
}

/** Logo lengkap: logomark dan wordmark "skrippy". Mengembalikan lebar total. */
export function drawLogo(
  page: PDFPage,
  fonts: Fonts,
  x: number,
  top: number,
  size: number,
  tone: "light" | "dark",
): number {
  drawLogoMark(page, x, top, size);
  const fontSize = size * 0.62;
  const w = fonts.sansBold.widthOfTextAtSize("skrippy", fontSize);
  page.drawText("skrippy", {
    x: x + size + size * 0.28,
    y: top - size / 2 - fontSize * 0.34,
    size: fontSize,
    font: fonts.sansBold,
    color: tone === "light" ? COLOR.white : COLOR.primary500,
  });
  return size + size * 0.28 + w;
}

/**
 * Pita judul di puncak halaman pertama: logo, jenis laporan, judul naskah, dan keterangan.
 * Mengembalikan posisi y tepat di bawah pita.
 */
export function drawCoverBand(
  page: PDFPage,
  fonts: Fonts,
  clean: (s: string) => string,
  opts: { kind: string; title: string; meta: string },
): number {
  const h = 144;
  const top = PAGE.h;
  page.drawRectangle({ x: 0, y: top - h, width: PAGE.w, height: h, color: COLOR.primary800 });
  // Garis mint tipis di tepi bawah pita sebagai aksen.
  page.drawRectangle({ x: 0, y: top - h, width: PAGE.w, height: 3, color: COLOR.accent300 });
  drawLogo(page, fonts, PAGE.margin, top - 24, 28, "light");
  const kind = clean(opts.kind).toUpperCase();
  const kw = fonts.sansBold.widthOfTextAtSize(kind, 8.5);
  text(page, kind, PAGE.w - PAGE.margin - kw, top - 40, fonts.sansBold, 8.5, COLOR.accent300);
  const title = wrapText(clean(opts.title), fonts.sansBold, 17, PAGE.w - PAGE.margin * 2).slice(
    0,
    2,
  );
  title.forEach((line, i) => {
    text(page, line, PAGE.margin, top - 80 - i * 21, fonts.sansBold, 17, COLOR.white);
  });
  text(page, clean(opts.meta), PAGE.margin, top - h + 18, fonts.sans, 9, COLOR.primary200);
  return top - h - 22;
}

/** Cincin skor: lintasan lembut dan busur hijau sebanding dengan nilai (0-100), angka di tengah. */
export function drawScoreRing(
  page: PDFPage,
  fonts: Fonts,
  cx: number,
  cy: number,
  radius: number,
  value: number,
  caption: string,
): void {
  const stroke = radius * 0.22;
  page.drawCircle({
    x: cx,
    y: cy,
    size: radius,
    borderWidth: stroke,
    borderColor: COLOR.primary100,
  });
  const v = Math.max(0, Math.min(100, value));
  if (v >= 99.95) {
    page.drawCircle({
      x: cx,
      y: cy,
      size: radius,
      borderWidth: stroke,
      borderColor: COLOR.primary500,
    });
  } else if (v > 0.05) {
    const angle = (v / 100) * Math.PI * 2;
    const ex = radius * Math.sin(angle);
    const ey = -radius * Math.cos(angle);
    const large = angle > Math.PI ? 1 : 0;
    page.drawSvgPath(`M 0 ${-radius} A ${radius} ${radius} 0 ${large} 1 ${ex} ${ey}`, {
      x: cx,
      y: cy,
      borderColor: COLOR.primary500,
      borderWidth: stroke,
      borderLineCap: 1,
    });
  }
  const label = String(Math.round(v));
  const size = radius * 0.78;
  const w = fonts.sansBold.widthOfTextAtSize(label, size);
  text(page, label, cx - w / 2, cy - size * 0.18, fonts.sansBold, size, COLOR.ink900);
  const cw = fonts.sans.widthOfTextAtSize(caption, 7.5);
  text(page, caption, cx - cw / 2, cy - radius - stroke / 2 - 10, fonts.sans, 7.5, COLOR.ink500);
}

/** Pil kecil berisi teks (mis. jumlah temuan). Mengembalikan lebar pil. */
export function drawPill(
  page: PDFPage,
  fonts: Fonts,
  x: number,
  top: number,
  label: string,
  fg: RGB,
  bg: RGB,
): number {
  const size = 8.5;
  const w = fonts.sansBold.widthOfTextAtSize(label, size) + 16;
  roundRect(page, x, top, w, 17, 8.5, bg);
  text(page, label, x + 8, top - 12, fonts.sansBold, size, fg);
  return w;
}

/** Batang persentase mendatar dengan latar lembut. */
export function drawBar(
  page: PDFPage,
  x: number,
  top: number,
  w: number,
  h: number,
  percent: number,
  color: RGB,
): void {
  roundRect(page, x, top, w, h, h / 2, COLOR.primary100);
  const fill = Math.max(0, Math.min(100, percent)) / 100;
  if (fill > 0) roundRect(page, x, top, Math.max(h, w * fill), h, h / 2, color);
}

/** Kaki halaman di setiap halaman: logo kecil, teks kiri (opsional), nomor halaman. Dipanggil setelah semua halaman ada. */
export function drawFooters(pdf: PDFDocument, fonts: Fonts, left: string | null): void {
  const pages = pdf.getPages();
  pages.forEach((pg, n) => {
    pg.drawLine({
      start: { x: PAGE.margin, y: 40 },
      end: { x: PAGE.w - PAGE.margin, y: 40 },
      thickness: 0.6,
      color: COLOR.ink200,
    });
    drawLogoMark(pg, PAGE.margin, 34, 14);
    text(pg, "skrippy", PAGE.margin + 19, 22, fonts.sansBold, 8.5, COLOR.primary500);
    if (left) text(pg, left, PAGE.margin + 70, 22, fonts.sans, 8, COLOR.ink500);
    const label = `Halaman ${n + 1} dari ${pages.length}`;
    const w = fonts.sans.widthOfTextAtSize(label, 8);
    text(pg, label, PAGE.w - PAGE.margin - w, 22, fonts.sans, 8, COLOR.ink500);
  });
}
