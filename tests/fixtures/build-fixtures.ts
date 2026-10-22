/** Bangkitkan naskah .docx sintetis untuk tes. Bukan naskah asli mahasiswa. */
import {
  AlignmentType,
  Document,
  Footer,
  ImageRun,
  LineRuleType,
  NumberFormat,
  PageNumber,
  Packer,
  Paragraph,
  SectionType,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from "docx";

const TWIPS_PER_CM = 1440 / 2.54;
const cm = (v: number): number => Math.round(v * TWIPS_PER_CM);

const FILLER = [
  "penelitian",
  "ini",
  "membahas",
  "sebuah",
  "topik",
  "tertentu",
  "melalui",
  "pendekatan",
  "yang",
  "sistematis",
  "dengan",
  "data",
  "lapangan",
  "hasil",
  "analisis",
  "menunjukkan",
  "pola",
  "menarik",
  "kajian",
  "teori",
  "relevan",
  "mendukung",
  "temuan",
  "utama",
  "peneliti",
  "menyusun",
  "langkah",
  "bertahap",
  "sesuai",
  "kebutuhan",
  "lokasi",
  "kegiatan",
  "belajar",
  "mengajar",
  "berlangsung",
  "secara",
  "rutin",
  "setiap",
  "pekan",
  "selama",
  "semester",
  "berjalan",
  "pembahasan",
  "mencakup",
  "berbagai",
  "aspek",
  "penting",
  "lain",
  "serta",
  "pengalaman",
  "responden",
  "kampus",
  "program",
  "studi",
  "kelas",
  "materi",
  "praktik",
  "evaluasi",
  "kemajuan",
  "capaian",
];

/** Teks pengisi deterministik; benih berbeda menghasilkan kalimat berbeda (tidak terdeteksi sebagai salinan). */
const filler = (words: number, seed = 1): string => {
  let state = seed * 2654435761;
  const next = (): number => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state;
  };
  const out: string[] = [];
  for (let i = 0; i < words; i += 12) {
    const sentence: string[] = [];
    for (let k = 0; k < Math.min(12, words - i); k++) {
      let w = FILLER[next() % FILLER.length]!;
      while (w === sentence[k - 1]) w = FILLER[next() % FILLER.length]!;
      sentence.push(w);
    }
    sentence[0] = sentence[0]!.charAt(0).toUpperCase() + sentence[0]!.slice(1);
    out.push(`${sentence.join(" ")}.`);
  }
  return out.join(" ");
};

const chapterFiller = (name: string): string =>
  `${filler(
    120,
    [...name].reduce((a, c) => a + c.charCodeAt(0), 7),
  )}${name === "BAB III" ? ` ${METHOD_SENTENCE}` : ""}`;

const METHOD_SENTENCE =
  "Populasi dan sampel diambil dari responden, dengan instrumen kuesioner dan analisis statistik deskriptif.";

export const LOREM =
  "Penelitian ini bertujuan untuk menganalisis pengaruh penggunaan aplikasi pemeriksa naskah terhadap kualitas penulisan skripsi mahasiswa pada program studi informatika.";

// PNG 1x1 transparan
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  ),
);

export type RunSpec = { text: string; italics?: boolean; bold?: boolean; font?: string };

export type Block =
  | {
      kind: "p";
      text?: string;
      runs?: RunSpec[];
      align?: "left" | "center" | "justify";
      bold?: boolean;
      lineSpacing?: number;
      indentCm?: number;
      font?: string;
      sizePt?: number;
    }
  | { kind: "table" }
  | { kind: "image" };

export type SectionSpec = {
  margins?: [number, number, number, number]; // kiri, atas, kanan, bawah (cm)
  pageNumber?: { format: "lowerRoman" | "decimal"; start?: number } | null;
  blocks: Block[];
};

export type BuildOptions = {
  font?: string;
  sizePt?: number;
  defaultLineSpacing?: number;
  defaultIndentCm?: number;
  defaultJustify?: boolean;
  paper?: [number, number]; // cm
  sections: SectionSpec[];
};

const ALIGN = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  justify: AlignmentType.JUSTIFIED,
} as const;

function paragraph(
  b: Extract<Block, { kind: "p" }>,
  o: Required<
    Pick<
      BuildOptions,
      "font" | "sizePt" | "defaultLineSpacing" | "defaultIndentCm" | "defaultJustify"
    >
  >,
): Paragraph {
  const runs = b.runs ?? [{ text: b.text ?? "" }];
  const isHeadingLike = b.bold !== undefined || b.align === "center";
  return new Paragraph({
    alignment: ALIGN[b.align ?? (isHeadingLike ? "left" : o.defaultJustify ? "justify" : "left")],
    spacing: {
      line: Math.round((b.lineSpacing ?? o.defaultLineSpacing) * 240),
      lineRule: LineRuleType.AUTO,
    },
    indent: isHeadingLike ? undefined : { firstLine: cm(b.indentCm ?? o.defaultIndentCm) },
    children: runs.map(
      (r) =>
        new TextRun({
          text: r.text,
          bold: r.bold ?? b.bold,
          italics: r.italics,
          font: r.font ?? b.font ?? o.font,
          size: Math.round((b.sizePt ?? o.sizePt) * 2),
        }),
    ),
  });
}

export async function buildDocx(opts: BuildOptions): Promise<Uint8Array> {
  const o = {
    font: opts.font ?? "Times New Roman",
    sizePt: opts.sizePt ?? 12,
    defaultLineSpacing: opts.defaultLineSpacing ?? 1.5,
    defaultIndentCm: opts.defaultIndentCm ?? 1.25,
    defaultJustify: opts.defaultJustify ?? true,
  };
  const [pw, ph] = opts.paper ?? [21, 29.7];

  const sections = opts.sections.map((s, i) => {
    const m = s.margins ?? [4, 4, 3, 3];
    const children = s.blocks.map((b) => {
      if (b.kind === "p") return paragraph(b, o);
      if (b.kind === "table") {
        return new Table({
          rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph("sel")] })] })],
        });
      }
      return new Paragraph({
        children: [
          new ImageRun({ type: "png", data: PNG, transformation: { width: 20, height: 20 } }),
        ],
      });
    });
    return {
      properties: {
        type: i === 0 ? undefined : SectionType.NEXT_PAGE,
        page: {
          size: { width: cm(pw), height: cm(ph) },
          margin: { left: cm(m[0]), top: cm(m[1]), right: cm(m[2]), bottom: cm(m[3]) },
          pageNumbers: s.pageNumber
            ? {
                formatType:
                  s.pageNumber.format === "lowerRoman"
                    ? NumberFormat.LOWER_ROMAN
                    : NumberFormat.DECIMAL,
                ...(s.pageNumber.start !== undefined ? { start: s.pageNumber.start } : {}),
              }
            : undefined,
        },
      },
      footers: s.pageNumber
        ? {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ children: [PageNumber.CURRENT] })],
                }),
              ],
            }),
          }
        : undefined,
      children,
    };
  });

  const doc = new Document({
    title: "Skripsi Sintetis",
    creator: "Penulis Uji",
    styles: { default: { document: { run: { font: o.font, size: Math.round(o.sizePt * 2) } } } },
    sections,
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

// --- pembungkus siap pakai ---------------------------------------------------

export const body = (text: string = LOREM): Block => ({ kind: "p", text });
export const heading = (text: string): Block => ({ kind: "p", text, bold: true, align: "center" });

export async function goodDocx(): Promise<Uint8Array> {
  return buildDocx({ sections: [{ blocks: [heading("BAB I"), body(), body()] }] });
}

export async function badFormatDocx(): Promise<Uint8Array> {
  return buildDocx({
    font: "Arial",
    sizePt: 11,
    defaultLineSpacing: 1.0,
    defaultIndentCm: 0,
    defaultJustify: false,
    sections: [
      {
        margins: [3, 4, 3, 3],
        blocks: [{ kind: "p", text: "Bab 1" }, body(), body()],
      },
    ],
  });
}

export const SECTIONS = [
  "LEMBAR PENGESAHAN",
  "ABSTRAK",
  "KATA PENGANTAR",
  "DAFTAR ISI",
  "BAB I",
  "BAB II",
  "BAB III",
  "BAB IV",
  "BAB V",
  "DAFTAR PUSTAKA",
];

export type ThesisOptions = {
  omit?: string[];
  order?: string[];
  abstractWords?: number;
  bodyBySection?: Record<string, Array<string | Block>>;
  references?: string[];
  /** Daftar isi berupa baris bertitik ("BAB I ..... 1"). */
  tocEntries?: string[];
};

/** Skripsi sintetis: judul bagian + paragraf + daftar pustaka, dalam satu section. */
export async function buildThesis(t: ThesisOptions = {}): Promise<Uint8Array> {
  const blocks: Block[] = [];
  for (const name of t.order ?? SECTIONS) {
    if (t.omit?.includes(name)) continue;
    blocks.push({ kind: "p", text: name, bold: true, align: "center" });
    if (name === "ABSTRAK")
      blocks.push({
        kind: "p",
        text: filler(t.abstractWords ?? 200, 99),
      });
    else if (name === "DAFTAR ISI") {
      for (const e of t.tocEntries ?? []) blocks.push({ kind: "p", text: e, align: "left" });
    } else if (name === "DAFTAR PUSTAKA") {
      for (const r of t.references ?? [])
        blocks.push({ kind: "p", text: r, align: "left", indentCm: 0 });
    } else {
      const given = t.bodyBySection?.[name];
      // Bab tanpa isi eksplisit diberi paragraf pengisi supaya lolos batas panjang bab (STR-006).
      const body = given ?? (name.startsWith("BAB") ? [chapterFiller(name)] : []);
      for (const b of body) blocks.push(typeof b === "string" ? { kind: "p", text: b } : b);
    }
  }
  return buildDocx({ sections: [{ blocks }] });
}
