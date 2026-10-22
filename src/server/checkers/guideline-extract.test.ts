import { describe, expect, it } from "vitest";
import { detectSections, extractRulesFromText } from "./guideline-extract";

const SAMPLE = `
BAB III FORMAT PENULISAN
3.1 Kertas. Naskah diketik pada kertas HVS ukuran A4 (21 x 29,7 cm).
3.2 Batas pengetikan. Margin kiri 4 cm, margin atas 3 cm, margin kanan 3 cm, dan margin bawah 3 cm.
3.3 Huruf. Naskah diketik menggunakan huruf Times New Roman dengan ukuran 12 pt.
3.4 Spasi. Isi naskah diketik dengan spasi 1,5. Kutipan langsung panjang memakai spasi 1.
3.5 Paragraf. Baris pertama setiap alinea baru menjorok ke dalam sebesar 1,27 cm. Teks diketik rata kiri-kanan (justify).
3.6 Abstrak ditulis dalam 150-300 kata.
3.7 Sitasi menggunakan gaya APA edisi 7. Pustaka acuan berasal dari 10 tahun terakhir.
3.8 Judul tabel ditulis di atas tabel, sedangkan judul gambar ditulis di bawah gambar.
`;

describe("ekstraksi pedoman dari teks", () => {
  const { rules, findings } = extractRulesFromText(SAMPLE);

  it("membaca margin keempat sisi", () => {
    expect(rules).toMatchObject({
      page: { size: "A4", margins_cm: { left: 4, top: 3, right: 3, bottom: 3 } },
    });
  });

  it("membaca huruf, spasi, indentasi, dan perataan isi", () => {
    expect(rules).toMatchObject({
      body: {
        font_family: "Times New Roman",
        font_size_pt: 12,
        line_spacing: 1.5,
        first_line_indent_cm: 1.27,
        alignment: "justify",
      },
    });
  });

  it("membaca abstrak, sitasi, dan letak keterangan", () => {
    expect(rules).toMatchObject({
      abstract_words: { min: 150, max: 300 },
      citation: { style: "apa", max_source_age_years: 10 },
      captions: { table_position: "above", figure_position: "below" },
    });
  });

  it("menyertakan kutipan sumber untuk setiap temuan", () => {
    expect(findings.length).toBeGreaterThanOrEqual(12);
    const left = findings.find((f) => f.path === "page.margins_cm.left");
    expect(left?.evidence).toContain("Margin kiri 4 cm");
  });

  it("mengonversi mm dan ketukan, serta mengabaikan nilai tak masuk akal", () => {
    const r = extractRulesFromText(
      "Margin kiri 40 mm. Margin atas 30 cm. Paragraf baru menjorok 5 ketukan.",
    );
    expect(r.rules).toMatchObject({
      page: { margins_cm: { left: 4 } },
      body: { first_line_indent_cm: 1.25 },
    });
    expect((r.rules.page as { margins_cm: Record<string, number> }).margins_cm.top).toBeUndefined();
  });

  it("teks tanpa aturan menghasilkan draft kosong", () => {
    expect(extractRulesFromText("Terima kasih kepada semua pihak.").findings).toEqual([]);
  });

  it("mengenali nama bagian yang disebut pedoman", () => {
    expect(
      detectSections(
        "Urutan: Halaman Judul, Lembar Pengesahan, Abstrak, Daftar Isi, Daftar Pustaka",
      ),
    ).toEqual(["HALAMAN JUDUL", "LEMBAR PENGESAHAN", "ABSTRAK", "DAFTAR ISI", "DAFTAR PUSTAKA"]);
  });
});
