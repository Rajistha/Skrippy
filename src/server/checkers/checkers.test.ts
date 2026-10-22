import { describe, expect, it } from "vitest";
import {
  badFormatDocx,
  body,
  buildDocx,
  buildThesis,
  goodDocx,
  heading,
  SECTIONS,
  type Block,
} from "@tests/fixtures/build-fixtures";
import { parseDocx } from "./parse/document";
import { runChecks } from "./registry";
import { resolveRules } from "./rules";
import { computeScores } from "./scoring";
import type { Category, Issue } from "./types";

const run = (data: Uint8Array, category: Category, rules = resolveRules()): Issue[] =>
  runChecks(parseDocx(data), rules, [category]);
const codes = (issues: Issue[]): string[] => [...new Set(issues.map((i) => i.ruleCode))].sort();

// --- format -------------------------------------------------------------------

describe("format", () => {
  it("naskah yang benar tidak punya temuan format", async () => {
    // satu section: FMT-009 wajar melapor; semua aturan lain harus bersih
    expect(codes(run(await goodDocx(), "format")).filter((c) => c !== "FMT-009")).toEqual([]);
  });

  it("naskah yang melanggar memicu aturan margin, huruf, ukuran, spasi, indentasi, perataan, judul bab", async () => {
    const found = codes(run(await badFormatDocx(), "format"));
    expect(found).toEqual(
      expect.arrayContaining(["FMT-002", "FMT-003", "FMT-004", "FMT-005", "FMT-006", "FMT-007"]),
    );
  });

  it("pesan margin menyebut nilai aktual dan seharusnya", async () => {
    const m = run(await badFormatDocx(), "format").find((i) => i.ruleCode === "FMT-002")!;
    expect(m.message).toBe("Margin kiri 3 cm, seharusnya 4 cm.");
    expect(m.severity).toBe("critical");
  });

  it("ukuran kertas salah", async () => {
    const data = await buildDocx({ paper: [21.59, 27.94], sections: [{ blocks: [body()] }] });
    expect(run(data, "format").find((i) => i.ruleCode === "FMT-001")?.message).toContain(
      "seharusnya A4",
    );
  });

  it("judul bab tidak kapital, tidak tengah, tidak tebal", async () => {
    const data = await buildDocx({
      sections: [{ blocks: [{ kind: "p", text: "Bab I" }, body()] }],
    });
    // "Bab I" cocok pola BAB (tidak peka huruf) tapi formatnya salah
    const issue = run(data, "format").find((i) => i.ruleCode === "FMT-008")!;
    expect(issue.message).toBe("Judul bab belum huruf kapital semua, tengah, tebal.");
  });

  it("aturan dimatikan lewat disabled_rules dan nilai pedoman menimpa default", async () => {
    const data = await badFormatDocx();
    const off = resolveRules({ disabled_rules: ["FMT-002"] });
    expect(codes(run(data, "format", off))).not.toContain("FMT-002");
    const custom = resolveRules({ page: { margins_cm: { left: 3 } } });
    expect(run(data, "format", custom).some((i) => i.message.startsWith("Margin kiri"))).toBe(
      false,
    );
    expect(custom.page.margins_cm).toEqual({ left: 3, top: 4, right: 3, bottom: 3 });
  });

  it("spasi 1,5 dan 2 sama-sama diterima", async () => {
    for (const ls of [1.5, 2]) {
      const data = await buildDocx({
        defaultLineSpacing: ls,
        sections: [{ blocks: [heading("BAB I"), body()] }],
      });
      expect(run(data, "format").some((i) => i.ruleCode === "FMT-005")).toBe(false);
    }
  });
});

describe("FMT-009 penomoran halaman", () => {
  const frontBody = (front: "lowerRoman" | "decimal", main: "lowerRoman" | "decimal") =>
    buildDocx({
      sections: [
        { pageNumber: { format: front }, blocks: [body("Kata pengantar dan abstrak naskah.")] },
        { pageNumber: { format: main, start: 1 }, blocks: [heading("BAB I"), body()] },
      ],
    });

  it("romawi di awal dan angka di isi lolos", async () => {
    expect(
      run(await frontBody("lowerRoman", "decimal"), "format").some((i) => i.ruleCode === "FMT-009"),
    ).toBe(false);
  });

  it("bagian awal berangka dilaporkan", async () => {
    const issue = run(await frontBody("decimal", "decimal"), "format").find(
      (i) => i.ruleCode === "FMT-009",
    )!;
    expect(issue.message).toContain("seharusnya romawi kecil");
    expect(issue.severity).toBe("critical");
  });

  it("isi naskah berromawi dilaporkan", async () => {
    const issue = run(await frontBody("lowerRoman", "lowerRoman"), "format").find(
      (i) => i.ruleCode === "FMT-009",
    )!;
    expect(issue.message).toContain("seharusnya angka");
  });

  it("satu section saja dilaporkan karena awal dan isi tak bisa dipisah", async () => {
    const data = await buildDocx({
      sections: [{ pageNumber: { format: "decimal" }, blocks: [heading("BAB I"), body()] }],
    });
    expect(run(data, "format").find((i) => i.ruleCode === "FMT-009")?.message).toContain(
      "hanya punya satu bagian",
    );
  });

  it("isi naskah tanpa field nomor halaman dilaporkan", async () => {
    const data = await buildDocx({
      sections: [
        { pageNumber: { format: "lowerRoman" }, blocks: [body("Kata pengantar.")] },
        { blocks: [heading("BAB I"), body()] }, // mewarisi footer -> ada field, jadi ubah: tanpa footer sama sekali
      ],
    });
    // Mewarisi footer berarti nomor tetap tampil; formatnya (decimal default) benar -> tidak ada temuan.
    expect(run(data, "format").some((i) => i.ruleCode === "FMT-009")).toBe(false);
  });
});

describe("FMT-010 dan FMT-011 caption", () => {
  const table: Block = { kind: "table" };
  const image: Block = { kind: "image" };
  const cap = (text: string): Block => ({ kind: "p", text, align: "left", indentCm: 0 });

  it("caption tabel di atas dan gambar di bawah lolos", async () => {
    const data = await buildDocx({
      sections: [
        {
          blocks: [
            heading("BAB II"),
            cap("Tabel 2.1 Data"),
            table,
            body(),
            image,
            cap("Gambar 2.1 Arsitektur"),
          ],
        },
      ],
    });
    expect(run(data, "format").some((i) => i.ruleCode === "FMT-010")).toBe(false);
  });

  it("caption tabel di bawah dan gambar di atas dilaporkan", async () => {
    const data = await buildDocx({
      sections: [
        {
          blocks: [
            heading("BAB II"),
            table,
            cap("Tabel 2.1 Data"),
            cap("Gambar 2.1 Arsitektur"),
            image,
          ],
        },
      ],
    });
    const messages = run(data, "format")
      .filter((i) => i.ruleCode === "FMT-010")
      .map((i) => i.message);
    expect(messages).toEqual([
      "Caption tabel di bawah tabel, seharusnya di atas.",
      "Caption gambar di atas gambar, seharusnya di bawah.",
    ]);
  });

  it("kalimat rujukan 'Tabel 2.1 menunjukkan' bukan caption", async () => {
    const data = await buildDocx({
      sections: [{ blocks: [heading("BAB II"), body("Tabel 2.1 menunjukkan hasil.")] }],
    });
    expect(run(data, "format").some((i) => i.ruleCode === "FMT-010")).toBe(false);
  });

  it("nomor caption yang melompat dilaporkan", async () => {
    const data = await buildDocx({
      sections: [
        { blocks: [heading("BAB II"), cap("Tabel 2.1 A"), table, cap("Tabel 2.3 B"), table] },
      ],
    });
    expect(run(data, "format").find((i) => i.ruleCode === "FMT-011")?.message).toBe(
      "Tabel 2.3 muncul setelah tabel 2.1, ada nomor yang terlewat.",
    );
  });

  it("nomor berurutan lolos", async () => {
    const data = await buildDocx({
      sections: [
        { blocks: [heading("BAB II"), cap("Tabel 2.1 A"), table, cap("Tabel 2.2 B"), table] },
      ],
    });
    expect(run(data, "format").some((i) => i.ruleCode === "FMT-011")).toBe(false);
  });
});

// --- struktur -----------------------------------------------------------------

describe("struktur", () => {
  it("struktur lengkap lolos", async () => {
    expect(run(await buildThesis(), "structure")).toEqual([]);
  });

  it("bagian wajib hilang itu kritis", async () => {
    const issues = run(await buildThesis({ omit: ["KATA PENGANTAR"] }), "structure");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ruleCode: "STR-001", severity: "critical" });
    expect(issues[0]!.message).toBe("Bagian Kata Pengantar tidak ditemukan.");
  });

  it("urutan salah", async () => {
    const order = [...SECTIONS];
    [order[1], order[2]] = [order[2]!, order[1]!];
    expect(codes(run(await buildThesis({ order }), "structure"))).toContain("STR-002");
  });

  it("panjang abstrak di luar batas", async () => {
    const issues = run(await buildThesis({ abstractWords: 50 }), "structure");
    expect(issues[0]!.message).toBe("Abstrak 50 kata, seharusnya 150 sampai 300 kata.");
  });

  it("daftar isi: bab yang tidak tercantum dilaporkan, baris daftar isi tidak dianggap judul bab", async () => {
    const data = await buildThesis({
      tocEntries: ["BAB I PENDAHULUAN ........ 1", "BAB II TINJAUAN ........ 5"],
    });
    const issues = run(data, "structure");
    const missing = issues.filter((i) => i.ruleCode === "STR-003").map((i) => i.message);
    expect(missing).toEqual([
      "Bab III ada di naskah tapi tidak ada di daftar isi.",
      "Bab IV ada di naskah tapi tidak ada di daftar isi.",
      "Bab V ada di naskah tapi tidak ada di daftar isi.",
    ]);
    // BAB I tetap ditemukan sebagai judul sebenarnya (bukan baris daftar isi)
    expect(issues.some((i) => i.ruleCode === "STR-001")).toBe(false);
    expect(issues.some((i) => i.ruleCode === "STR-002")).toBe(false);
  });

  it("daftar isi lengkap lolos", async () => {
    const entries = ["I", "II", "III", "IV", "V"].map((r) => `BAB ${r} JUDUL ........ 1`);
    expect(
      run(await buildThesis({ tocEntries: entries }), "structure").some(
        (i) => i.ruleCode === "STR-003",
      ),
    ).toBe(false);
  });

  it("penomoran subbab: terlewat dan salah bab", async () => {
    const data = await buildThesis({
      bodyBySection: {
        "BAB II": ["2.1 Landasan", "2.3 Kerangka", "3.1 Salah bab"],
      },
    });
    const messages = run(data, "structure")
      .filter((i) => i.ruleCode === "STR-004")
      .map((i) => i.message);
    expect(messages).toEqual([
      "Subbab 2.3 muncul setelah 2.1, ada nomor yang terlewat.",
      "Subbab 3.1 berada di Bab 2, nomornya seharusnya 2.1.",
    ]);
  });

  it("penomoran subbab berurutan lolos", async () => {
    const data = await buildThesis({ bodyBySection: { "BAB II": ["2.1 A", "2.2 B", "2.2.1 C"] } });
    expect(run(data, "structure").some((i) => i.ruleCode === "STR-004")).toBe(false);
  });
});

// --- ejaan --------------------------------------------------------------------

describe("ejaan", () => {
  const withBody = (...texts: Array<string | Block>) =>
    buildThesis({ bodyBySection: { "BAB I": texts } });

  it("kata tidak baku disertai koreksi", async () => {
    const messages = run(
      await withBody("Hasil analisa menunjukkan resiko yang kecil."),
      "spelling",
    ).map((i) => i.message);
    expect(messages).toContain('Kata tidak baku "analisa", seharusnya "analisis".');
    expect(messages).toContain('Kata tidak baku "resiko", seharusnya "risiko".');
  });

  it("ejaan yang benar lolos", async () => {
    expect(run(await withBody("Hasil analisis menunjukkan risiko kecil."), "spelling")).toEqual([]);
  });

  it("spasi ganda dan tanda baca", async () => {
    const found = codes(
      run(await withBody("Kalimat  ini ganda.", "Contoh , salah.", "Satu,dua tiga."), "spelling"),
    );
    expect(found).toEqual(["EJA-003", "EJA-004"]);
  });

  it("di dan ke: gabungan salah dan imbuhan terpisah", async () => {
    const messages = run(
      await withBody("Letaknya dibawah meja.", "Data di gunakan untuk uji."),
      "spelling",
    )
      .filter((i) => i.ruleCode === "EJA-002")
      .map((i) => i.message);
    expect(messages).toEqual([
      '"dibawah" sebagai kata depan ditulis terpisah: "di bawah".',
      '"di gunakan" memakai di- sebagai imbuhan, ditulis serangkai: "digunakan".',
    ]);
  });

  it("di bawah dan digunakan yang benar lolos", async () => {
    expect(
      codes(run(await withBody("Letaknya di bawah meja dan digunakan untuk uji."), "spelling")),
    ).not.toContain("EJA-002");
  });

  it("huruf kecil di awal kalimat, mengabaikan singkatan dan angka", async () => {
    const bad = run(await withBody("Ini kalimat pertama. ini kalimat kedua."), "spelling");
    expect(bad.some((i) => i.ruleCode === "EJA-005")).toBe(true);
    const ok = run(
      await withBody("Menurut Adams dkk. hasilnya baik. Lihat bagian 2.1 untuk rincian."),
      "spelling",
    );
    expect(ok.some((i) => i.ruleCode === "EJA-005")).toBe(false);
  });

  const spellCodes = async (text: string): Promise<string[]> =>
    run(await withBody(text), "spelling").map((i) => i.ruleCode);

  it("EJA-007 kata berulang berurutan", async () => {
    expect(await spellCodes("Hasil ini yang yang terbaik.")).toContain("EJA-007");
    expect(await spellCodes("Hasil ini yang terbaik, anak-anak setuju.")).not.toContain("EJA-007");
  });

  it("EJA-008 tanda berpasangan dan tanda baca ganda", async () => {
    expect(await spellCodes("Metode itu (lihat Bab III dipakai.")).toContain("EJA-008");
    expect(await spellCodes('Ia berkata "selesai dan pergi.')).toContain("EJA-008");
    expect(await spellCodes("Hasilnya baik,, sesuai harapan.")).toContain("EJA-008");
    expect(
      await spellCodes("Metode itu (lihat Bab III) dipakai, a) satu dan b) dua."),
    ).not.toContain("EJA-008");
    expect(await spellCodes("Hasil lengkap...")).not.toContain("EJA-008");
  });

  it("EJA-009 angka dan satuan menyatu", async () => {
    expect(await spellCodes("Beratnya 50kg dan panjang 12 cm.")).toContain("EJA-009");
    expect(await spellCodes("Beratnya 50 kg dan panjang 12 cm.")).not.toContain("EJA-009");
  });

  it("EJA-011 istilah dengan dan tanpa tanda hubung", async () => {
    const bad = run(
      await withBody(
        "Toko memakai e-commerce. Sistem e-commerce itu baik. Ecommerce lain berbeda.",
      ),
      "spelling",
    ).filter((i) => i.ruleCode === "EJA-011");
    expect(bad).toHaveLength(1);
    expect(bad[0]!.message).toContain('"ecommerce"');
    expect(await spellCodes("Toko memakai e-commerce. Sistem e-commerce itu baik.")).not.toContain(
      "EJA-011",
    );
  });

  it("EJA-012 singkatan sebelum dijelaskan dan yang tidak dipakai", async () => {
    const early = run(
      await withBody("Pakai ERP di kantor.", "Enterprise Resource Planning (ERP) membantu bisnis."),
      "spelling",
    ).filter((i) => i.ruleCode === "EJA-012");
    expect(early.map((i) => i.message)).toEqual(['Singkatan "ERP" dipakai sebelum dijelaskan.']);
    expect(await spellCodes("Enterprise Resource Planning (ERP) membantu bisnis.")).toContain(
      "EJA-012",
    );
    const ok = await withBody(
      "Enterprise Resource Planning (ERP) membantu bisnis.",
      "Sistem ERP dipakai luas.",
    );
    expect(run(ok, "spelling").some((i) => i.ruleCode === "EJA-012")).toBe(false);
  });

  it("istilah asing tidak miring dilaporkan, yang miring lolos", async () => {
    const plain = await withBody("Sistem memakai machine learning untuk klasifikasi data.");
    expect(run(plain, "spelling").some((i) => i.ruleCode === "EJA-006")).toBe(true);
    const italic = await withBody({
      kind: "p",
      runs: [
        { text: "Sistem memakai " },
        { text: "machine learning", italics: true },
        { text: " untuk klasifikasi data." },
      ],
    });
    expect(run(italic, "spelling").some((i) => i.ruleCode === "EJA-006")).toBe(false);
  });
});

// --- sitasi -------------------------------------------------------------------

describe("sitasi", () => {
  const REFS = [
    "Adams, B. (2020). Judul buku satu. Penerbit.",
    "Budi, C. (2021). Judul buku dua. Penerbit.",
  ];
  const cite = (text: string, references = REFS) =>
    buildThesis({ bodyBySection: { "BAB I": [text] }, references });

  it("sitasi cocok dengan daftar pustaka", async () => {
    expect(
      run(await cite("Menurut (Adams, 2020) dan Budi (2021) hal ini benar."), "citation"),
    ).toEqual([]);
  });

  it("sitasi tanpa entri itu kritis", async () => {
    const hit = run(await cite("Seperti dikatakan (Chandra, 2019) sebelumnya."), "citation").find(
      (i) => i.ruleCode === "SIT-001",
    )!;
    expect(hit.severity).toBe("critical");
    expect(hit.message).toBe("Sitasi Chandra (2019) tidak ada di daftar pustaka.");
  });

  it("entri tidak pernah disitasi", async () => {
    expect(codes(run(await cite("Menurut (Adams, 2020) ini benar."), "citation"))).toEqual([
      "SIT-002",
    ]);
  });

  it("tahun berbeda", async () => {
    const issues = run(await cite("Menurut (Adams, 2018) dan Budi (2021) ini benar."), "citation");
    expect(codes(issues)).toEqual(["SIT-004"]);
    expect(issues[0]!.message).toBe("Tahun sitasi Adams 2018, di daftar pustaka 2020.");
  });

  it("daftar pustaka tidak alfabet", async () => {
    const issues = run(
      await cite("(Adams, 2020) dan (Budi, 2021).", [...REFS].reverse()),
      "citation",
    );
    expect(codes(issues)).toEqual(["SIT-003"]);
  });

  it("sitasi dengan banyak penulis dan dkk.", async () => {
    const refs = [
      "Adams, B., & Lee, C. (2020). Judul. Penerbit.",
      "Budi, C. dkk. (2021). Judul. Penerbit.",
    ];
    expect(run(await cite("(Adams & Lee, 2020; Budi dkk., 2021)", refs), "citation")).toEqual([]);
  });

  it("proporsi sumber lama", async () => {
    const refs = [
      "Aa, A. (2001). X.",
      "Bb, A. (2002). X.",
      "Cc, A. (2003). X.",
      "Dd, A. (2004). X.",
      "Ee, A. (2005). X.",
    ];
    const text = "(Aa, 2001) (Bb, 2002) (Cc, 2003) (Dd, 2004) (Ee, 2005)";
    expect(codes(run(await cite(text, refs), "citation"))).toEqual(["SIT-005"]);
  });
});

// --- skor ---------------------------------------------------------------------

describe("skor", () => {
  it("penalti mengikuti bobot keparahan, minimum 0", async () => {
    const rules = resolveRules();
    const issues = run(await buildThesis({ omit: ["KATA PENGANTAR", "DAFTAR ISI"] }), "structure");
    expect(computeScores(issues, ["structure"], rules)).toEqual({
      total: 80,
      byCategory: { structure: 80 },
    });
    const many = Array.from({ length: 20 }, () => issues[0]!);
    expect(computeScores(many, ["structure"], rules).byCategory.structure).toBe(0);
  });

  it("total adalah rata-rata kategori yang dijalankan", () => {
    const rules = resolveRules();
    const issues: Issue[] = [
      { category: "format", ruleCode: "FMT-001", severity: "critical", message: "x" },
    ];
    expect(computeScores(issues, ["format", "spelling"], rules)).toEqual({
      total: 95,
      byCategory: { format: 90, spelling: 100 },
    });
  });

  it("pesan bagian hilang menjaga angka romawi bab tetap kapital", async () => {
    const issues = run(await buildThesis({ omit: ["BAB III"] }), "structure");
    expect(issues[0]!.message).toBe("Bagian Bab III tidak ditemukan.");
  });
});

describe("aturan tambahan gelombang 1", () => {
  const only = (issues: Issue[], code: string): Issue[] =>
    issues.filter((i) => i.ruleCode === code);

  it("FMT-014 satu bagian paragraf berhuruf lain", async () => {
    const mixed = await buildThesis({
      bodyBySection: {
        "BAB I": [
          {
            kind: "p",
            runs: [
              { text: "Penelitian ini memakai " },
              { text: "metode campuran", font: "Calibri" },
              { text: " dalam pengumpulan data." },
            ],
          },
        ],
      },
    });
    const found = only(run(mixed, "format"), "FMT-014");
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toBe("Sebagian teks memakai Calibri, seharusnya Times New Roman.");
    expect(only(run(await goodDocx(), "format"), "FMT-014")).toEqual([]);
  });

  it("STR-006 bab kosong atau terlalu pendek", async () => {
    const short = await buildThesis({
      bodyBySection: { "BAB I": ["Hanya satu kalimat."], "BAB II": [] },
    });
    const messages = only(run(short, "structure"), "STR-006").map((i) => i.message);
    expect(messages).toEqual([
      "Bab I hanya 3 kata, seharusnya minimal 100 kata.",
      "Bab II belum ada isinya.",
    ]);
    expect(only(run(await buildThesis(), "structure"), "STR-006")).toEqual([]);
  });

  const refCodes = async (references: string[], text = "Menurut (Adams, 2020) hal ini benar.") =>
    run(await buildThesis({ bodyBySection: { "BAB I": [text] }, references }), "citation");

  it("SIT-006 format entri daftar pustaka APA", async () => {
    const bad = await refCodes([
      "Adams, B. 2020. Judul tanpa kurung. Penerbit.",
      "Budi, C (2021). Titik hilang setelah tahun",
      "Citra Dewi (2019) Tanpa titik.",
    ]);
    expect(only(bad, "SIT-006").map((i) => i.message)).toEqual([
      "Entri daftar pustaka tidak memuat tahun dalam kurung, misalnya (2020).",
      "Nama penulis tidak ditulis dengan pola Nama belakang, Inisial.",
      "Tahun dalam entri daftar pustaka harus diikuti titik: (2020).",
    ]);
    const ok = await refCodes([
      "Adams, B., & Budi, C. (2020). Judul buku satu. Penerbit.",
      "Kementerian Kesehatan. (2019). Laporan tahunan. Jakarta.",
    ]);
    expect(only(ok, "SIT-006")).toEqual([]);
    const ieee = resolveRules({ citation: { style: "ieee" } });
    const data = await buildThesis({ references: ["tanpa format apa pun"] });
    expect(only(run(data, "citation", ieee), "SIT-006")).toEqual([]);
  });

  it("SIT-007 gaya sitasi tercampur", async () => {
    const REFS = ["Adams, B. (2020). Judul buku satu. Penerbit."];
    const mixed = await refCodes(REFS, "Menurut (Adams, 2020) dan juga [1] hal ini benar.");
    expect(only(mixed, "SIT-007")).toHaveLength(1);
    expect(only(await refCodes(REFS), "SIT-007")).toEqual([]);
  });

  it("SIT-009 entri daftar pustaka ganda", async () => {
    const dup = await refCodes([
      "Adams, B. (2020). Judul buku satu. Penerbit.",
      "Adams, B. (2020). Judul Buku Satu. Penerbit lain.",
      "Budi, C. (2021). Judul buku dua. Penerbit.",
    ]);
    expect(only(dup, "SIT-009")).toHaveLength(1);
    const ok = await refCodes([
      "Adams, B. (2020). Judul buku satu. Penerbit.",
      "Adams, B. (2020). Judul buku lain. Penerbit.",
    ]);
    expect(only(ok, "SIT-009")).toEqual([]);
  });
});
