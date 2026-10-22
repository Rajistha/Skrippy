/**
 * Membaca teks sebuah buku pedoman penulisan dan menebak nilai aturannya dengan pola bahasa Indonesia.
 * Murni dan deterministik (tanpa AI, tanpa I/O): hasilnya hanya DRAFT yang wajib ditinjau admin.
 * Setiap nilai disertai kutipan kalimat sumber agar admin bisa memeriksa dari mana nilai itu berasal.
 */

export type Finding = {
  /** Jalur kunci di rules, mis. "page.margins_cm.left". */
  path: string;
  label: string;
  value: string | number;
  /** Kalimat dari pedoman tempat nilai ditemukan (dipotong 200 karakter). */
  evidence: string;
};

export type Extraction = {
  /** Hanya kunci yang berhasil dideteksi; sisanya diisi default saat disimpan. */
  rules: Record<string, unknown>;
  findings: Finding[];
};

const num = (s: string): number => Number(s.replace(",", "."));

/** Pisahkan teks menjadi kalimat pendek supaya pola tidak melompat antar topik. */
function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.;:!?])\s+(?=[A-Z0-9(])|\s•\s|\s[-–]\s(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

const clip = (s: string): string => (s.length > 200 ? `${s.slice(0, 197)}...` : s);

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let node = target;
  for (const part of parts.slice(0, -1)) {
    const next = node[part];
    if (typeof next !== "object" || next === null || Array.isArray(next)) node[part] = {};
    node = node[part] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]!] = value;
}

const SIDES = { kiri: "left", atas: "top", kanan: "right", bawah: "bottom" } as const;
const SIDE_LABEL = {
  left: "Margin kiri",
  top: "Margin atas",
  right: "Margin kanan",
  bottom: "Margin bawah",
} as const;
const NUM = String.raw`(\d{1,2}(?:[.,]\d{1,2})?)`;
const FONTS = [
  "Times New Roman",
  "Arial",
  "Calibri",
  "Cambria",
  "Book Antiqua",
  "Garamond",
  "Tahoma",
  "Verdana",
  "Georgia",
];
const WORD_NUMBER: Record<string, number> = { satu: 1, dua: 2, tiga: 3 };

export function extractRulesFromText(raw: string): Extraction {
  const rules: Record<string, unknown> = {};
  const findings: Finding[] = [];
  const found = new Set<string>();

  const add = (path: string, label: string, value: string | number, evidence: string): void => {
    if (found.has(path)) return;
    found.add(path);
    setPath(rules, path, value);
    findings.push({ path, label, value, evidence: clip(evidence) });
  };

  const list = sentences(raw);

  for (const s of list) {
    const lower = s.toLowerCase();

    // Margin: "margin kiri 4 cm", "batas atas: 3 cm", "4 cm dari tepi kiri", "kiri 4 cm".
    if (/margin|batas|tepi|pias/.test(lower)) {
      for (const [word, side] of Object.entries(SIDES)) {
        const before = new RegExp(
          String.raw`\b${word}\b[^0-9.;]{0,25}?${NUM}\s*(cm|mm|centimeter)`,
          "i",
        ).exec(s);
        const after = new RegExp(
          String.raw`${NUM}\s*(cm|mm|centimeter)[^0-9.;]{0,25}?\b${word}\b`,
          "i",
        ).exec(s);
        const m = before ?? after;
        if (m) {
          const cm = m[2]!.toLowerCase() === "mm" ? num(m[1]!) / 10 : num(m[1]!);
          if (cm >= 1 && cm <= 8) add(`page.margins_cm.${side}`, SIDE_LABEL[side], cm, s);
        }
      }
    }

    // Ukuran kertas.
    if (/kertas|ukuran/.test(lower)) {
      const paper = /\b(A4|A5|Letter|Folio|F4|Legal)\b/i.exec(s);
      if (paper)
        add(
          "page.size",
          "Ukuran kertas",
          paper[1]!.toUpperCase() === "LETTER" ? "Letter" : paper[1]!.toUpperCase(),
          s,
        );
    }

    // Huruf: jenis dan ukuran.
    if (/huruf|font|jenis/.test(lower)) {
      const font = FONTS.find((f) => lower.includes(f.toLowerCase()));
      if (font) add("body.font_family", "Jenis huruf isi", font, s);
      const size = new RegExp(
        String.raw`(?:ukuran|size|besar)?[^0-9]{0,20}${NUM}\s*(?:pt|point|poin|pts)\b`,
        "i",
      ).exec(s);
      if (size && /huruf|font|ukuran/.test(lower)) {
        const pt = num(size[1]!);
        if (pt >= 8 && pt <= 16) add("body.font_size_pt", "Ukuran huruf isi", pt, s);
      }
    }

    // Spasi: "spasi 1,5", "1,5 spasi", "dua spasi".
    if (/spasi/.test(lower) && !/antar ?(?:bab|paragraf|alinea)/.test(lower)) {
      const digit = new RegExp(String.raw`spasi\s*${NUM}|${NUM}\s*spasi`, "i").exec(s);
      const word = /\b(satu|dua|tiga)\s+spasi/i.exec(s);
      const value = digit
        ? num(digit[1] ?? digit[2]!)
        : word
          ? WORD_NUMBER[word[1]!.toLowerCase()]
          : undefined;
      if (
        value !== undefined &&
        value >= 1 &&
        value <= 3 &&
        /isi|teks|naskah|uraian|paragraf|alinea|ketik/.test(lower)
      ) {
        add("body.line_spacing", "Spasi isi", value, s);
      }
    }

    // Indentasi baris pertama.
    if (/menjorok|indentasi|alinea baru|paragraf baru|awal (?:alinea|paragraf)/.test(lower)) {
      const m = new RegExp(String.raw`${NUM}\s*(cm|mm|ketukan)`, "i").exec(s);
      if (m) {
        const unit = m[2]!.toLowerCase();
        const cm = unit === "mm" ? num(m[1]!) / 10 : unit === "cm" ? num(m[1]!) : num(m[1]!) * 0.25;
        if (cm > 0 && cm <= 3)
          add(
            "body.first_line_indent_cm",
            "Indentasi baris pertama",
            Math.round(cm * 100) / 100,
            s,
          );
      }
    }

    // Perataan teks.
    if (/rata|perataan|justify|alignment/.test(lower)) {
      if (/kiri[\s-]*(?:dan|[-–/])?\s*kanan|justif|rata penuh/.test(lower))
        add("body.alignment", "Perataan isi", "justify", s);
      else if (/rata kiri/.test(lower) && /isi|teks|uraian|naskah|paragraf/.test(lower))
        add("body.alignment", "Perataan isi", "left", s);
    }

    // Gaya sitasi.
    if (/sitasi|kutipan|daftar pustaka|rujukan|referensi|acuan/.test(lower)) {
      const style = /\b(APA|IEEE|Harvard|Chicago|Vancouver|MLA)\b/.exec(s);
      if (style) add("citation.style", "Gaya sitasi", style[1]!.toLowerCase(), s);
    }

    // Usia sumber: "10 tahun terakhir".
    if (/pustaka|referensi|sumber|literatur|acuan|jurnal/.test(lower)) {
      const m = /(\d{1,2})\s*\(?[a-z]*\)?\s*tahun\s*terakhir/i.exec(s);
      if (m) {
        const years = Number(m[1]);
        if (years >= 2 && years <= 30)
          add("citation.max_source_age_years", "Usia sumber maksimal (tahun)", years, s);
      }
    }

    // Panjang abstrak: "150-300 kata", "maksimal 250 kata".
    if (/abstrak|abstract/.test(lower)) {
      const range = /(\d{2,4})\s*(?:-|–|sampai|hingga|s\.?d\.?)\s*(\d{2,4})\s*kata/i.exec(s);
      const max = /(?:maksimal|maksimum|paling banyak|tidak lebih dari)\s*(\d{2,4})\s*kata/i.exec(
        s,
      );
      if (range) {
        add("abstract_words.min", "Abstrak minimal (kata)", Number(range[1]), s);
        add("abstract_words.max", "Abstrak maksimal (kata)", Number(range[2]), s);
      } else if (max) {
        add("abstract_words.max", "Abstrak maksimal (kata)", Number(max[1]), s);
      }
    }

    // Letak keterangan tabel dan gambar.
    if (/tabel/.test(lower) && /(?:judul|keterangan|caption)/.test(lower)) {
      if (/di atas|diatas|sebelah atas/.test(lower))
        add("captions.table_position", "Judul tabel", "above", s);
      else if (/di bawah|dibawah/.test(lower))
        add("captions.table_position", "Judul tabel", "below", s);
    }
    if (/gambar/.test(lower) && /(?:judul|keterangan|caption)/.test(lower)) {
      if (/di bawah|dibawah|sebelah bawah/.test(lower))
        add("captions.figure_position", "Judul gambar", "below", s);
      else if (/di atas|diatas/.test(lower))
        add("captions.figure_position", "Judul gambar", "above", s);
    }
  }

  return { rules, findings };
}

/** Nama bagian skripsi yang dikenali untuk menyarankan `required_sections`. */
const KNOWN_SECTIONS = [
  "HALAMAN JUDUL",
  "LEMBAR PERSETUJUAN",
  "LEMBAR PENGESAHAN",
  "PERNYATAAN KEASLIAN",
  "ABSTRAK",
  "ABSTRACT",
  "KATA PENGANTAR",
  "DAFTAR ISI",
  "DAFTAR TABEL",
  "DAFTAR GAMBAR",
  "DAFTAR LAMPIRAN",
  "DAFTAR PUSTAKA",
  "LAMPIRAN",
];

/** Bagian yang disebut di pedoman. Dikembalikan terpisah karena hanya saran, bukan nilai pasti. */
export function detectSections(raw: string): string[] {
  const upper = raw.toUpperCase();
  return KNOWN_SECTIONS.filter((name) => upper.includes(name));
}
