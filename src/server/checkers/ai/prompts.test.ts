import { describe, expect, it } from "vitest";
import { buildThesis } from "@tests/fixtures/build-fixtures";
import { parseDocx } from "../parse/document";
import {
  batchParagraphs,
  extractAbstract,
  extractBibliographyEntries,
  extractAlignmentContext,
  extractConsistencyContext,
  extractJsonArray,
  parseAbstractResponse,
  parseBibliographyResponse,
  parseAlignmentResponse,
  parseConsistencyResponse,
  parseGrammarResponse,
  selectParagraphs,
} from "./prompts";

const LONG =
  "Penelitian ini bertujuan untuk menganalisis pengaruh penggunaan aplikasi terhadap kualitas tulisan mahasiswa.";

describe("memilih paragraf untuk AI", () => {
  it("melewati judul, paragraf pendek, dan daftar pustaka", async () => {
    const doc = parseDocx(
      await buildThesis({
        abstractWords: 0,
        bodyBySection: {
          "BAB I": [LONG, "Terlalu pendek."],
          "BAB II": [`${LONG} Kedua.`],
          "BAB III": [],
          "BAB IV": [],
          "BAB V": [],
        },
        references: [`Penulis, A. (2020). ${LONG} Jurnal Uji.`],
      }),
    );
    const { paragraphs, truncated } = selectParagraphs(doc, 100_000);
    expect(truncated).toBe(false);
    expect(paragraphs.map((p) => p.text)).toEqual([LONG, `${LONG} Kedua.`]);
  });

  it("memotong bila melebihi batas karakter", async () => {
    const doc = parseDocx(
      await buildThesis({
        abstractWords: 0,
        bodyBySection: { "BAB I": [LONG, `${LONG} Lagi.`, `${LONG} Dan lagi.`] },
      }),
    );
    const { paragraphs, truncated } = selectParagraphs(doc, 150);
    expect(paragraphs).toHaveLength(1);
    expect(truncated).toBe(true);
  });

  it("membagi menjadi kelompok berukuran terbatas", () => {
    const paras = Array.from({ length: 10 }, (_, i) => ({ index: i, text: "x".repeat(1000) }));
    const batches = batchParagraphs(paras, 3500);
    expect(batches.map((b) => b.length)).toEqual([3, 3, 3, 1]);
  });
});

describe("membaca jawaban AI", () => {
  const batch = [
    {
      index: 4,
      text: "Aplikasi ini sangat berguna sekali bagi para mahasiswa yang sedang menyusun skripsi.",
    },
    { index: 7, text: "Data dikumpulkan melalui kuesioner yang disebarkan kepada responden." },
  ];

  it("menerima temuan dengan kutipan yang benar dan memetakan jenisnya", () => {
    const answer = JSON.stringify([
      {
        p: 4,
        type: "sentence",
        severity: "minor",
        excerpt: "sangat berguna sekali",
        message: "Pemborosan kata.",
        suggestion: "sangat berguna",
      },
      {
        p: 7,
        type: "grammar",
        severity: "major",
        excerpt: "melalui kuesioner",
        message: "Contoh.",
        suggestion: "dengan kuesioner",
      },
    ]);
    const issues = parseGrammarResponse(`Berikut hasilnya:\n\`\`\`json\n${answer}\n\`\`\``, batch);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      category: "ai",
      ruleCode: "AI-003",
      severity: "minor",
      location: { paragraphIndex: 4 },
    });
    expect(issues[1]).toMatchObject({
      ruleCode: "AI-001",
      severity: "major",
      excerpt: "melalui kuesioner",
    });
  });

  it("membuang kutipan karangan, nomor paragraf asing, duplikat, dan bentuk rusak", () => {
    const answer = JSON.stringify([
      { p: 4, excerpt: "kalimat yang tidak ada di paragraf", message: "Karangan model." },
      { p: 99, excerpt: "sangat berguna", message: "Paragraf tidak ada." },
      { p: 4, excerpt: "SANGAT  berguna", message: "Sah (spasi dan huruf besar dinormalkan)." },
      { p: 4, excerpt: "sangat berguna", message: "Duplikat." },
      { p: "4", excerpt: "sangat berguna", message: "Tipe salah." },
      { p: 4, severity: "critical", excerpt: "sangat berguna", message: "Tingkat tak dikenal." },
    ]);
    const issues = parseGrammarResponse(answer, batch);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("Sah");
  });

  it("jawaban bukan JSON menghasilkan daftar kosong, bukan galat", () => {
    expect(parseGrammarResponse("Maaf, saya tidak bisa.", batch)).toEqual([]);
    expect(parseGrammarResponse("[ {rusak", batch)).toEqual([]);
    expect(extractJsonArray("tanpa larik")).toEqual([]);
  });

  it("memotong pesan, saran, dan kutipan panjang", () => {
    const issues = parseGrammarResponse(
      JSON.stringify([
        { p: 4, excerpt: "sangat berguna", message: "m".repeat(550), suggestion: "s".repeat(700) },
      ]),
      batch,
    );
    expect(issues[0]!.message.length).toBeLessThanOrEqual(300);
    expect(issues[0]!.suggestion!.length).toBeLessThanOrEqual(400);
  });
});

describe("konteks konsistensi antarbab", () => {
  const thesis = () =>
    buildThesis({
      bodyBySection: {
        "BAB I": [
          { kind: "p", text: "Rumusan Masalah", bold: true },
          "Bagaimana pengaruh aplikasi terhadap kualitas penulisan skripsi mahasiswa informatika?",
          { kind: "p", text: "Tujuan Penelitian", bold: true },
          "Menganalisis pengaruh aplikasi terhadap kualitas penulisan skripsi mahasiswa informatika.",
        ],
        "BAB V": [
          { kind: "p", text: "Kesimpulan", bold: true },
          "Aplikasi terbukti meningkatkan kecepatan pengetikan naskah oleh mahasiswa informatika.",
        ],
      },
    });

  it("menemukan rumusan, tujuan, dan kesimpulan", async () => {
    const ctx = extractConsistencyContext(parseDocx(await thesis()));
    expect(ctx).not.toBeNull();
    expect(ctx!.problems[0]!.text).toContain("Bagaimana pengaruh");
    expect(ctx!.objectives[0]!.text).toContain("Menganalisis");
    expect(ctx!.conclusions[0]!.text).toContain("kecepatan pengetikan");
  });

  it("tanpa bagian rumusan atau kesimpulan, konteks kosong", async () => {
    expect(extractConsistencyContext(parseDocx(await buildThesis({})))).toBeNull();
  });

  it("temuan konsistensi hanya diterima bila menunjuk paragraf konteks", async () => {
    const ctx = extractConsistencyContext(parseDocx(await thesis()))!;
    const conclusionIndex = ctx.conclusions[0]!.index;
    const issues = parseConsistencyResponse(
      JSON.stringify([
        {
          p: conclusionIndex,
          excerpt: "meningkatkan kecepatan pengetikan",
          message: "Tidak menjawab rumusan masalah.",
          suggestion: "Bahas kualitas penulisan.",
        },
        { p: 0, excerpt: "judul", message: "Di luar konteks." },
      ]),
      ctx,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ruleCode: "AI-002", severity: "major", category: "ai" });
  });
});

describe("jenis temuan AI tambahan", () => {
  it("clarity dan claim dipetakan ke AI-004 dan AI-005", () => {
    const batch = [
      { index: 2, text: "Hal ini menyebabkan angka pengangguran naik sebesar 12 persen." },
    ];
    const issues = parseGrammarResponse(
      JSON.stringify([
        { p: 2, type: "clarity", excerpt: "Hal ini", message: "Acuan tidak jelas." },
        { p: 2, type: "claim", excerpt: "naik sebesar 12 persen", message: "Butuh sitasi." },
      ]),
      batch,
    );
    expect(issues.map((i) => i.ruleCode)).toEqual(["AI-004", "AI-005"]);
  });

  it("abstrak: paragraf diambil sampai judul berikutnya dan temuan divalidasi", async () => {
    const doc = parseDocx(await buildThesis({ abstractWords: 60 }));
    const abstract = extractAbstract(doc)!;
    expect(abstract).toHaveLength(1);
    const first = abstract[0]!.text.split(" ").slice(0, 3).join(" ");
    const issues = parseAbstractResponse(
      JSON.stringify([
        { p: abstract[0]!.index, excerpt: first, message: "Metode belum disebut." },
        { p: abstract[0]!.index, excerpt: "kalimat karangan", message: "Dibuang." },
      ]),
      abstract,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ruleCode: "AI-006", severity: "minor", category: "ai" });
    expect(extractAbstract(parseDocx(await buildThesis({ omit: ["ABSTRAK"] })))).toBeNull();
  });

  it("kesesuaian: butuh tujuan, metode, dan hasil; temuan wajib menunjuk konteks", async () => {
    const doc = parseDocx(
      await buildThesis({
        bodyBySection: {
          "BAB I": [
            { kind: "p", text: "Tujuan Penelitian", bold: true },
            "Menganalisis pengaruh aplikasi terhadap kualitas penulisan skripsi mahasiswa.",
          ],
        },
      }),
    );
    const ctx = extractAlignmentContext(doc)!;
    expect(ctx).not.toBeNull();
    expect(ctx.method.length).toBeGreaterThan(0);
    expect(ctx.results.length).toBeGreaterThan(0);
    const target = ctx.objectives[0]!;
    const issues = parseAlignmentResponse(
      JSON.stringify([
        { p: target.index, excerpt: "Menganalisis pengaruh", message: "Tidak ada hasil sepadan." },
        { p: 9999, excerpt: "apa saja", message: "Di luar konteks." },
      ]),
      ctx,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ruleCode: "AI-007", severity: "major" });
    expect(extractAlignmentContext(parseDocx(await buildThesis({ omit: ["BAB IV"] })))).toBeNull();
  });
});

describe("entri daftar pustaka untuk AI", () => {
  it("diambil dari bawah judul daftar pustaka dan temuannya divalidasi", async () => {
    const doc = parseDocx(
      await buildThesis({
        references: [
          "Adams, B. (2020). Judul buku satu tanpa penerbit yang jelas sama sekali.",
          "Budi, C. (2021). Judul buku dua. Penerbit Contoh.",
        ],
      }),
    );
    const entries = extractBibliographyEntries(doc)!;
    expect(entries).toHaveLength(2);
    const issues = parseBibliographyResponse(
      JSON.stringify([
        { p: entries[0]!.index, excerpt: "tanpa penerbit", message: "Penerbit hilang." },
        { p: entries[1]!.index, excerpt: "kutipan karangan", message: "Dibuang." },
      ]),
      entries,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ruleCode: "AI-009", category: "ai", severity: "minor" });
    expect(
      extractBibliographyEntries(parseDocx(await buildThesis({ omit: ["DAFTAR PUSTAKA"] }))),
    ).toBeNull();
  });
});
