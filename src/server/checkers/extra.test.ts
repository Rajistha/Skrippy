import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseDocx } from "./parse/document";
import { runChecks } from "./registry";
import { resolveRules } from "./rules";
import type { Category, Issue } from "./types";

// --- pembuat docx mentah untuk fitur yang tidak ada di library `docx` --------------------------

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
  'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/"';

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

type P = { bold?: boolean; spacing?: number; hanging?: boolean; font?: string };
const p = (text: string, o: P = {}): string => {
  const ppr =
    `<w:pPr>${o.spacing ? `<w:spacing w:line="${o.spacing * 240}" w:lineRule="auto"/>` : ""}` +
    `${o.hanging ? '<w:ind w:left="709" w:hanging="709"/>' : ""}</w:pPr>`;
  const rpr = `<w:rPr>${o.font ? `<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}"/>` : ""}${o.bold ? "<w:b/>" : ""}</w:rPr>`;
  return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
};
const image = (cxCm: number): string =>
  `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="${Math.round(cxCm * 360000)}" cy="900000"/></wp:inline></w:drawing></w:r></w:p>`;
const table = (colsCm: number[], header = false): string =>
  `<w:tbl><w:tblGrid>${colsCm.map((c) => `<w:gridCol w:w="${Math.round(c * 567)}"/>`).join("")}</w:tblGrid>` +
  `<w:tr>${header ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}<w:tc><w:p><w:r><w:t>x</w:t></w:r></w:p></w:tc></w:tr>` +
  `<w:tr><w:tc><w:p><w:r><w:t>y</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;
const math = (): string =>
  "<w:p><m:oMathPara><m:oMath><m:r><m:t>x=1</m:t></m:r></m:oMath></m:oMathPara></w:p>";

const SECT =
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:left="2268" w:top="2268" w:right="1701" w:bottom="1701"/></w:sectPr>';

function docx(body: string[], parts: Record<string, string> = {}): Uint8Array {
  return zipSync({
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document ${NS}><w:body>${body.join("")}${SECT}</w:body></w:document>`,
    ),
    ...Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, strToU8(v)])),
  });
}

const run = (data: Uint8Array, category: Category, rules = resolveRules()): Issue[] =>
  runChecks(parseDocx(data), rules, [category]);
const only = (issues: Issue[], code: string): Issue[] => issues.filter((i) => i.ruleCode === code);

const WORDS = (n: number, seed = 0): string =>
  Array.from({ length: n }, (_, i) => `kata${(i * 7 + seed) % 97}x`)
    .join(" ")
    .concat(".");

// --- parser --------------------------------------------------------------------------------

describe("parser: struktur tambahan", () => {
  it("membaca tabel, lebar gambar, persamaan, dan field TOC", () => {
    const doc = parseDocx(
      docx([
        image(6),
        table([4, 5], true),
        math(),
        '<w:p><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" </w:instrText></w:r></w:p>',
      ]),
    );
    expect(doc.paragraphs[0]!.imageWidthCm).toBeCloseTo(6, 1);
    expect(doc.tables).toHaveLength(1);
    expect(doc.tables[0]).toMatchObject({ rows: 2, cols: 2, hasHeaderRow: true });
    expect(doc.tables[0]!.widthCm).toBeCloseTo(9, 0);
    expect(doc.paragraphs.some((x) => x.hasMath)).toBe(true);
    expect(doc.hasTocField).toBe(true);
  });

  it("menghitung revisi, komentar, catatan kaki, dan metadata", () => {
    const doc = parseDocx(
      docx(
        [
          '<w:p><w:ins w:id="1"><w:r><w:t>baru</w:t></w:r></w:ins><w:del w:id="2"><w:r><w:delText>lama</w:delText></w:r></w:del></w:p>',
        ],
        {
          "word/comments.xml": `<w:comments ${NS}><w:comment w:id="0"/><w:comment w:id="1"/></w:comments>`,
          "word/footnotes.xml": `<w:footnotes ${NS}><w:footnote w:type="separator" w:id="-1"/><w:footnote w:id="1"/></w:footnotes>`,
          "docProps/core.xml": `<cp:coreProperties ${NS}><dc:title>Judul</dc:title><dc:creator>Penulis</dc:creator></cp:coreProperties>`,
        },
      ),
    );
    expect(doc.revisions).toBe(2);
    expect(doc.commentCount).toBe(2);
    expect(doc.footnoteCount).toBe(1);
    expect(doc.meta).toEqual({ title: "Judul", author: "Penulis", lastModifiedBy: null });
  });

  it("tanpa bagian tambahan semuanya bernilai kosong", () => {
    const doc = parseDocx(docx([p("Halo")]));
    expect(doc).toMatchObject({
      tables: [],
      revisions: 0,
      commentCount: 0,
      footnoteCount: 0,
      hasTocField: false,
      meta: null,
    });
  });
});

// --- format -------------------------------------------------------------------------------

describe("format tambahan", () => {
  it("FMT-012 subbab harus tebal", () => {
    const bad = run(docx([p("1.1 Latar Belakang"), p(WORDS(30))]), "format");
    expect(only(bad, "FMT-012")).toHaveLength(1);
    const ok = run(docx([p("1.1 Latar Belakang", { bold: true }), p(WORDS(30))]), "format");
    expect(only(ok, "FMT-012")).toEqual([]);
  });

  it("FMT-012 huruf kapital tiap kata bila pedoman memintanya", () => {
    const rules = resolveRules({ subheading: { bold: false, capitalization: "title" } });
    const bad = run(docx([p("1.1 latar belakang masalah")]), "format", rules);
    expect(only(bad, "FMT-012")[0]!.message).toContain('"latar"');
    const ok = run(docx([p("1.1 Latar Belakang dan Masalah")]), "format", rules);
    expect(only(ok, "FMT-012")).toEqual([]);
  });

  it("FMT-013 dan FMT-015 daftar pustaka: spasi dan indentasi gantung", () => {
    const entry = "Adams, B. (2020). Judul buku satu. Penerbit.";
    const bad = run(docx([p("DAFTAR PUSTAKA"), p(entry, { spacing: 1.5 })]), "format");
    expect(only(bad, "FMT-013")).toHaveLength(1);
    expect(only(bad, "FMT-015")).toHaveLength(1);
    const ok = run(docx([p("DAFTAR PUSTAKA"), p(entry, { spacing: 1, hanging: true })]), "format");
    expect(only(ok, "FMT-013")).toEqual([]);
    expect(only(ok, "FMT-015")).toEqual([]);
  });

  it("FMT-016 halaman judul tanpa logo, NIM, dan tahun", () => {
    const bad = run(
      docx([p("SKRIPSI"), p("Nama Mahasiswa"), p("LEMBAR PENGESAHAN"), p("isi")]),
      "format",
    );
    expect(only(bad, "FMT-016")[0]!.message).toBe(
      "Halaman judul belum memuat logo kampus, NIM, tahun.",
    );
    const ok = run(
      docx([
        image(4),
        p("SKRIPSI"),
        p("Nama Mahasiswa 215150200111001"),
        p("Malang 2025"),
        p("LEMBAR PENGESAHAN"),
      ]),
      "format",
    );
    expect(only(ok, "FMT-016")).toEqual([]);
  });

  it("FMT-017 dan FMT-018 rujukan silang tabel dan gambar", () => {
    const doc = docx([
      p("Seperti terlihat pada Tabel 2.1 dan Gambar 9.9 maka hasilnya baik."),
      p("Tabel 2.1 Data awal"),
      table([6]),
      p("Tabel 2.2 Data lanjutan"),
      table([6]),
    ]);
    const issues = run(doc, "format");
    expect(only(issues, "FMT-017").map((i) => i.message)).toEqual([
      "Gambar 9.9 dirujuk di teks tetapi tidak ada caption-nya.",
    ]);
    expect(only(issues, "FMT-018").map((i) => i.message)).toEqual([
      "Tabel 2.2 tidak pernah dirujuk di teks.",
    ]);
  });

  it("FMT-019 gambar dan tabel melewati lebar teks", () => {
    const bad = run(docx([image(20), table([18])]), "format");
    expect(only(bad, "FMT-019")).toHaveLength(2);
    const ok = run(docx([image(10), table([10])]), "format");
    expect(only(ok, "FMT-019")).toEqual([]);
  });

  it("FMT-020 dan FMT-021 gambar dan tabel tanpa caption", () => {
    const bad = run(docx([p("BAB I"), p(WORDS(30)), image(8), table([6])]), "format");
    expect(only(bad, "FMT-020")).toHaveLength(1);
    expect(only(bad, "FMT-021")).toHaveLength(1);
    const ok = run(
      docx([p("BAB I"), image(8), p("Gambar 1.1 Alur"), p("Tabel 1.1 Data"), table([6])]),
      "format",
    );
    expect(only(ok, "FMT-020")).toEqual([]);
    expect(only(ok, "FMT-021")).toEqual([]);
  });

  it("FMT-022 persamaan tanpa nomor", () => {
    expect(only(run(docx([math()]), "format"), "FMT-022")).toHaveLength(1);
    const numbered =
      "<w:p><m:oMath><m:r><m:t>x=1</m:t></m:r></m:oMath><w:r><w:t>(2.1)</w:t></w:r></w:p>";
    expect(only(run(docx([numbered]), "format"), "FMT-022")).toEqual([]);
  });

  it("FMT-023 komentar dan perubahan terlacak yang tertinggal", () => {
    const withReview = docx(['<w:p><w:ins w:id="1"><w:r><w:t>baru</w:t></w:r></w:ins></w:p>'], {
      "word/comments.xml": `<w:comments ${NS}><w:comment w:id="0"/></w:comments>`,
    });
    expect(only(run(withReview, "format"), "FMT-023")[0]!.message).toBe(
      "Naskah masih memuat 1 perubahan terlacak (track changes) dan 1 komentar.",
    );
    expect(only(run(docx([p("bersih")]), "format"), "FMT-023")).toEqual([]);
  });
});

// --- struktur -----------------------------------------------------------------------------

describe("struktur tambahan", () => {
  const chapters = (...bodies: string[][]): string[] =>
    ["I", "II", "III", "IV", "V"].flatMap((r, i) => [p(`BAB ${r}`), ...(bodies[i] ?? [])]);

  it("STR-007 subbab wajib per bab (hanya bila pedoman mengaturnya)", () => {
    const rules = resolveRules({ required_subsections: { "BAB III": ["Teknik Analisis Data"] } });
    const bad = run(
      docx(chapters([], [], [p("3.1 Desain Penelitian", { bold: true })])),
      "structure",
      rules,
    );
    expect(only(bad, "STR-007")[0]!.message).toBe(
      'Bab III belum memuat subbab "Teknik Analisis Data".',
    );
    const ok = run(
      docx(chapters([], [], [p("3.2 Teknik Analisis Data", { bold: true })])),
      "structure",
      rules,
    );
    expect(only(ok, "STR-007")).toEqual([]);
    expect(only(run(docx(chapters()), "structure"), "STR-007")).toEqual([]);
  });

  it("STR-008 daftar tabel tidak sama dengan jumlah caption", () => {
    const toc = (text: string): string =>
      p(`${text} ........ 5`).replace("<w:pPr>", '<w:pPr><w:pStyle w:val="TOC1"/>');
    const bad = run(
      docx([
        p("DAFTAR TABEL"),
        toc("Tabel 1.1 Satu"),
        toc("Tabel 1.2 Dua"),
        p("BAB I"),
        p("Tabel 1.1 Satu"),
        table([6]),
      ]),
      "structure",
    );
    expect(only(bad, "STR-008")[0]!.message).toBe(
      "Daftar tabel memuat 2 entri, naskah punya 1 tabel bercaption.",
    );
  });

  it("STR-009 subbab kosong", () => {
    const bad = run(
      docx([
        p("1.1 Latar Belakang", { bold: true }),
        p("1.2 Rumusan Masalah", { bold: true }),
        p(WORDS(30)),
      ]),
      "structure",
    );
    expect(only(bad, "STR-009")).toHaveLength(1);
    const nested = run(
      docx([p("2.1 Teori", { bold: true }), p("2.1.1 Konsep", { bold: true }), p(WORDS(30))]),
      "structure",
    );
    expect(only(nested, "STR-009")).toEqual([]);
  });

  it("STR-010 daftar isi diketik manual", () => {
    const manual = [p("DAFTAR ISI"), p("BAB I ........ 1"), p("BAB I"), p(WORDS(30))];
    expect(only(run(docx(manual), "structure"), "STR-010")).toHaveLength(1);
    const auto = [
      p("DAFTAR ISI"),
      '<w:p><w:r><w:instrText> TOC \\o "1-3" </w:instrText></w:r></w:p>',
      p("BAB I ........ 1"),
    ];
    expect(only(run(docx(auto), "structure"), "STR-010")).toEqual([]);
  });

  it("STR-011 Bab III harus menyebut populasi, instrumen, dan analisis", () => {
    const empty = chapters([], [], [p(WORDS(80))]);
    expect(only(run(docx(empty), "structure"), "STR-011")).toHaveLength(3);
    const full = chapters(
      [],
      [],
      [p(`${WORDS(60)} Populasi dan sampel, instrumen kuesioner, serta analisis regresi.`)],
    );
    expect(only(run(docx(full), "structure"), "STR-011")).toEqual([]);
  });

  it("STR-012 rumusan masalah tanpa jejak di Bab IV dan V", () => {
    const question =
      "Bagaimana pengaruh kepemimpinan transformasional terhadap kinerja karyawan perusahaan?";
    const results = `${WORDS(120, 5)} Pembahasan mengenai kinerja sudah dijelaskan secara rinci.`;
    const bad = run(docx(chapters([p(question)], [], [], [p(results)])), "structure");
    expect(only(bad, "STR-012")).toHaveLength(1);
    const traced = `${results} Kepemimpinan transformasional berpengaruh terhadap kinerja karyawan perusahaan.`;
    const ok = run(docx(chapters([p(question)], [], [], [p(traced)])), "structure");
    expect(only(ok, "STR-012")).toEqual([]);
  });

  it("STR-013 paragraf salinan", () => {
    const text = WORDS(60, 3);
    const bad = run(docx([p("BAB I"), p(text), p("BAB II"), p(text)]), "structure");
    expect(only(bad, "STR-013")).toHaveLength(1);
    const ok = run(docx([p("BAB I"), p(text), p("BAB II"), p(WORDS(60, 41))]), "structure");
    expect(only(ok, "STR-013")).toEqual([]);
  });
});

// --- ejaan dan sitasi ---------------------------------------------------------------------

describe("ejaan dan sitasi tambahan", () => {
  const long = Array.from({ length: 45 }, (_, i) => `kata${i}`).join(" ");

  it("EJA-010 kalimat terlalu panjang", () => {
    const bad = run(docx([p("BAB I"), p(`${long}.`)]), "spelling");
    expect(only(bad, "EJA-010")).toHaveLength(1);
    expect(
      only(run(docx([p("BAB I"), p("Kalimat ini pendek saja.")]), "spelling"), "EJA-010"),
    ).toEqual([]);
  });

  const withRefs = (text: string, refs: string[]): Uint8Array =>
    docx([p("BAB I"), p(text), p("DAFTAR PUSTAKA"), ...refs.map((r) => p(r))]);

  it("SIT-008 dkk. untuk sumber yang penulisnya kurang dari tiga", () => {
    const refs = ["Adams, B., & Lee, C. (2020). Judul. Penerbit."];
    const bad = run(withRefs("Menurut Adams dkk. (2020) hasilnya baik.", refs), "citation");
    expect(only(bad, "SIT-008")).toHaveLength(1);
    const three = ["Adams, B., Lee, C., & Budi, D. (2020). Judul. Penerbit."];
    expect(
      only(run(withRefs("Menurut Adams dkk. (2020) baik.", three), "citation"), "SIT-008"),
    ).toEqual([]);
  });

  it("SIT-010 artikel jurnal tanpa DOI", () => {
    const bad = run(
      withRefs("Menurut (Adams, 2020) baik.", [
        "Adams, B. (2020). Judul artikel. Jurnal Uji, 3(2), 1-10.",
      ]),
      "citation",
    );
    expect(only(bad, "SIT-010")).toHaveLength(1);
    const ok = run(
      withRefs("Menurut (Adams, 2020) baik.", [
        "Adams, B. (2020). Judul artikel. Jurnal Uji, 3(2), 1-10. https://doi.org/10.1/x",
      ]),
      "citation",
    );
    expect(only(ok, "SIT-010")).toEqual([]);
  });

  it("SIT-011 kutipan langsung tanpa halaman", () => {
    const quote = 'Menurutnya, "kualitas pendidikan sangat ditentukan oleh guru yang baik"';
    const refs = ["Adams, B. (2020). Judul. Penerbit."];
    const bad = run(withRefs(`${quote} (Adams, 2020).`, refs), "citation");
    expect(only(bad, "SIT-011")).toHaveLength(1);
    const ok = run(withRefs(`${quote} (Adams, 2020, hlm. 15).`, refs), "citation");
    expect(only(ok, "SIT-011")).toEqual([]);
  });
});

describe("header, catatan kaki, dan properti", () => {
  const header = (name: string, text: string): Record<string, string> => ({
    [`word/${name}`]: `<w:hdr ${NS}><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:hdr>`,
  });

  it("FMT-024 header hanya di sebagian bagian isi", () => {
    const rels = `<Relationships><Relationship Id="rId1" Target="header1.xml"/></Relationships>`;
    const sect = (ref: boolean): string =>
      `<w:p><w:pPr><w:sectPr>${ref ? '<w:headerReference w:type="default" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>' : ""}<w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:pPr></w:p>`;
    const parts = {
      ...header("header1.xml", "Judul Skripsi"),
      "word/_rels/document.xml.rels": rels,
    };
    const mixed = docx([p("a"), sect(false), p("b"), sect(true), p("c")], parts);
    expect(only(run(mixed, "format"), "FMT-024")).toHaveLength(1);
    const same = docx([p("a"), sect(false), p("b"), sect(false), p("c")], parts);
    expect(only(run(same, "format"), "FMT-024")).toEqual([]);
  });

  it("FMT-025 catatan kaki pada gaya sitasi dalam teks", () => {
    const notes = {
      "word/footnotes.xml": `<w:footnotes ${NS}><w:footnote w:id="1"/><w:footnote w:id="2"/></w:footnotes>`,
    };
    expect(only(run(docx([p("isi")], notes), "format"), "FMT-025")).toHaveLength(1);
    expect(only(run(docx([p("isi")]), "format"), "FMT-025")).toEqual([]);
  });

  it("FMT-026 properti judul dan penulis kosong, hanya bila berkas properti ada", () => {
    const empty = { "docProps/core.xml": `<cp:coreProperties ${NS}></cp:coreProperties>` };
    expect(only(run(docx([p("isi")], empty), "format"), "FMT-026")[0]!.message).toBe(
      "Properti dokumen belum memuat judul dan penulis.",
    );
    const full = {
      "docProps/core.xml": `<cp:coreProperties ${NS}><dc:title>T</dc:title><dc:creator>A</dc:creator></cp:coreProperties>`,
    };
    expect(only(run(docx([p("isi")], full), "format"), "FMT-026")).toEqual([]);
    expect(only(run(docx([p("isi")]), "format"), "FMT-026")).toEqual([]);
  });
});

describe("gambar dan tabel: teks alternatif, baris judul, huruf", () => {
  const altImage = (descr: string): string =>
    `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="3600000" cy="900000"/><wp:docPr id="1" name="G" descr="${descr}"/></wp:inline></w:drawing></w:r></w:p>`;
  const styledTable = (rows: number, font: string, sizeHalfPt: number, header: boolean): string =>
    `<w:tbl><w:tblGrid><w:gridCol w:w="3000"/></w:tblGrid>` +
    Array.from(
      { length: rows },
      (_, i) =>
        `<w:tr>${header && i === 0 ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}<w:tc><w:p><w:r><w:rPr><w:rFonts w:ascii="${font}"/><w:sz w:val="${sizeHalfPt}"/></w:rPr><w:t>isi sel</w:t></w:r></w:p></w:tc></w:tr>`,
    ).join("") +
    `</w:tbl>`;

  it("FMT-027 gambar tanpa teks alternatif", () => {
    const bad = run(docx([p("BAB I"), altImage("")]), "format");
    expect(only(bad, "FMT-027")).toHaveLength(1);
    const ok = run(docx([p("BAB I"), altImage("Diagram alur sistem")]), "format");
    expect(only(ok, "FMT-027")).toEqual([]);
  });

  it("FMT-028 tabel panjang tanpa baris judul", () => {
    const bad = run(docx([styledTable(4, "Times New Roman", 24, false)]), "format");
    expect(only(bad, "FMT-028")).toHaveLength(1);
    const ok = run(docx([styledTable(4, "Times New Roman", 24, true)]), "format");
    expect(only(ok, "FMT-028")).toEqual([]);
    const short = run(docx([styledTable(2, "Times New Roman", 24, false)]), "format");
    expect(only(short, "FMT-028")).toEqual([]);
  });

  it("FMT-029 huruf di dalam tabel", () => {
    const bad = run(docx([styledTable(2, "Calibri", 28, true)]), "format");
    expect(only(bad, "FMT-029")[0]!.message).toBe(
      "Isi tabel memakai jenis huruf Calibri, seharusnya Times New Roman dan ukuran huruf 14 pt, melebihi 12 pt.",
    );
    const smaller = run(docx([styledTable(2, "Times New Roman", 20, true)]), "format");
    expect(only(smaller, "FMT-029")).toEqual([]);
  });
});
