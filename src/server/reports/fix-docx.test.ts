import { describe, expect, it } from "vitest";
import { body, buildDocx, goodDocx, heading } from "@tests/fixtures/build-fixtures";
import { parseDocx } from "../checkers/parse/document";
import { runChecks } from "../checkers/registry";
import { loadDefaults, resolveRules } from "../checkers/rules";
import { foreignTermRegex, hasUnitalicForeignTerm } from "../checkers/spelling/rules";
import { bodyParagraphs } from "../checkers/types";
import { fixDocx, fixText, type FixSummary } from "./fix-docx";
import type { ParagraphFix } from "./fix-format";

const fresh = (): FixSummary => ({
  nonStandard: 0,
  mergedPrepositions: 0,
  doubleSpaces: 0,
  spaceBeforePunctuation: 0,
  fonts: 0,
  sizes: 0,
  spacings: 0,
  margins: 0,
  indents: 0,
  alignments: 0,
  italics: 0,
  tables: 0,
});

describe("perbaikan otomatis teks", () => {
  it("mengganti kata tidak baku, di/ke gabungan, spasi ganda, dan spasi sebelum tanda baca", () => {
    const s = fresh();
    const out = fixText("Analisa  data dibawah meja , resiko kecil.", s);
    expect(out).toBe("Analisis data di bawah meja, risiko kecil.");
    expect(s).toEqual({
      nonStandard: 2,
      mergedPrepositions: 1,
      doubleSpaces: 1,
      spaceBeforePunctuation: 1,
      fonts: 0,
      sizes: 0,
      spacings: 0,
      margins: 0,
      indents: 0,
      alignments: 0,
      italics: 0,
      tables: 0,
    });
  });

  it("teks yang sudah benar tidak berubah", () => {
    const s = fresh();
    expect(fixText("Hasil analisis menunjukkan risiko kecil.", s)).toBe(
      "Hasil analisis menunjukkan risiko kecil.",
    );
    expect(Object.values(s).every((n) => n === 0)).toBe(true);
  });
});

describe("fixDocx", () => {
  it("memperbaiki isi naskah, menjaga daftar pustaka, dan hasilnya tetap docx valid", async () => {
    const data = await buildDocx({
      sections: [
        {
          blocks: [
            heading("BAB I"),
            body("Hasil analisa  menunjukkan resiko yang kecil ."),
            heading("DAFTAR PUSTAKA"),
            body("Adams, B. (2020). Analisa resiko. Penerbit."),
          ],
        },
      ],
    });
    const before = parseDocx(data);
    const bib = before.paragraphs.find((p) => p.text === "DAFTAR PUSTAKA")!.index;
    const { bytes, total } = fixDocx(data, bib);
    expect(total).toBe(4);
    const after = parseDocx(bytes);
    expect(after.paragraphs[1]!.text).toBe("Hasil analisis menunjukkan risiko yang kecil.");
    expect(after.paragraphs[3]!.text).toBe("Adams, B. (2020). Analisa resiko. Penerbit.");
    expect(after.paragraphs[1]!.runs[0]!.fontName).toBe(before.paragraphs[1]!.runs[0]!.fontName);
  });

  it("tanpa perubahan mengembalikan berkas yang sama", async () => {
    const data = await buildDocx({ sections: [{ blocks: [body("Kalimat yang sudah benar.")] }] });
    const out = fixDocx(data, null);
    expect(out.total).toBe(0);
    expect(out.bytes).toBe(data);
  });
});

describe("fixDocx: perbaikan format", () => {
  const rules = loadDefaults();

  it("menyamakan huruf, ukuran, spasi, dan margin dengan pedoman, lalu hasilnya terbaca ulang", async () => {
    const data = await buildDocx({
      font: "Arial",
      sizePt: 14,
      defaultLineSpacing: 1,
      sections: [
        {
          margins: [3, 3, 2, 2],
          blocks: [heading("BAB I"), body("Penelitian ini membahas topik tertentu."), body()],
        },
      ],
    });
    const before = parseDocx(data);
    const wrong = new Map<number, ParagraphFix>(
      bodyParagraphs(before).map((p) => [
        p.index,
        { font: true, size: true, spacing: true, indent: false, align: false, italic: false },
      ]),
    );
    expect(wrong.size).toBe(2);
    const out = fixDocx(data, null, { rules, paragraphs: wrong });
    expect(out.summary).toMatchObject({ fonts: 2, sizes: 2, spacings: 2, margins: 1 });
    const after = parseDocx(out.bytes);
    for (const p of bodyParagraphs(after)) {
      expect(p.runs.every((r) => r.fontName === "Times New Roman" && r.fontSizePt === 12)).toBe(
        true,
      );
      expect(p.lineSpacing).toBe(1.5);
    }
    const sec = after.sections[0]!;
    expect([sec.marginLeftCm, sec.marginTopCm, sec.marginRightCm, sec.marginBottomCm]).toEqual([
      4, 4, 3, 3,
    ]);
    // Judul bab tidak disentuh.
    expect(after.paragraphs[0]!.runs[0]!.fontName).toBe("Arial");
  });

  it("paragraf yang sudah benar dan margin yang sudah benar tidak diubah", async () => {
    const data = await goodDocx();
    const out = fixDocx(data, null, { rules, paragraphs: new Map() });
    expect(out.total).toBe(0);
    expect(out.bytes).toBe(data);
  });
});

describe("fixDocx: indentasi, perataan, istilah asing, dan lebar tabel", () => {
  const rules = resolveRules(loadDefaults() as never);
  const foreign = foreignTermRegex();
  const long = "Kami memakai database dan input data untuk analisis hasil penelitian ini.";

  /** Sama dengan formatFixes di service: paragraf isi yang menyimpang dari pedoman. */
  function needs(data: Uint8Array): Map<number, ParagraphFix> {
    const doc = parseDocx(data);
    const out = new Map<number, ParagraphFix>();
    for (const p of bodyParagraphs(doc)) {
      out.set(p.index, {
        font: false,
        size: false,
        spacing: false,
        indent: Math.abs((p.firstLineIndentCm ?? 0) - rules.body.first_line_indent_cm) > 0.15,
        align: (p.alignment ?? "left") !== rules.body.alignment,
        italic: hasUnitalicForeignTerm(p, foreign),
      });
    }
    return out;
  }

  const codes = (data: Uint8Array): string[] =>
    runChecks(parseDocx(data), rules, ["format", "spelling"]).map((i) => i.ruleCode);

  it("menyamakan indentasi, perataan, dan cetak miring istilah asing tanpa mengubah teks", async () => {
    const data = await buildDocx({
      defaultIndentCm: 0,
      defaultJustify: false,
      sections: [{ blocks: [heading("BAB I"), body(long), body(long)] }],
    });
    expect(codes(data)).toEqual(expect.arrayContaining(["FMT-006", "FMT-007", "EJA-006"]));
    const textBefore = parseDocx(data).paragraphs.map((p) => p.text);

    const out = fixDocx(data, null, { rules, paragraphs: needs(data) });
    expect(out.summary).toMatchObject({ indents: 2, alignments: 2, italics: 2 });
    const after = codes(out.bytes);
    expect(after).not.toContain("FMT-006");
    expect(after).not.toContain("FMT-007");
    expect(after).not.toContain("EJA-006");
    // Teks utuh walau run dipecah, dan hanya istilahnya yang miring.
    expect(parseDocx(out.bytes).paragraphs.map((p) => p.text)).toEqual(textBefore);
    const italic = parseDocx(out.bytes)
      .paragraphs[1]!.runs.filter((r) => r.italic)
      .map((r) => r.text);
    expect(italic).toEqual(["database", "input"]);
  });

  it("run yang sudah miring dan paragraf berdaftar tidak diubah", async () => {
    const data = await buildDocx({
      defaultIndentCm: 1.25,
      defaultJustify: true,
      sections: [
        {
          blocks: [
            heading("BAB I"),
            {
              kind: "p",
              runs: [
                { text: "Kami memakai " },
                { text: "database", italics: true },
                { text: " dan metode lain untuk analisis hasil penelitian ini." },
              ],
            },
          ],
        },
      ],
    });
    const out = fixDocx(data, null, { rules, paragraphs: needs(data) });
    expect(out.total).toBe(0);
  });

  it("tabel yang melewati area teks sesudah margin diubah dikecilkan agar muat", async () => {
    const data = await buildDocx({
      sections: [
        { margins: [3, 4, 3, 3], blocks: [heading("BAB I"), body(), { kind: "table" }, body()] },
      ],
    });
    // Margin 3 cm: tabel 15 cm muat. Margin pedoman 4 cm di kiri menyempitkannya jadi 14 cm.
    expect(codes(data)).not.toContain("FMT-019");
    const out = fixDocx(data, null, { rules, paragraphs: new Map() });
    expect(out.summary).toMatchObject({ margins: 1, tables: 1 });
    expect(codes(out.bytes)).not.toContain("FMT-019");
    const table = parseDocx(out.bytes).tables[0]!;
    expect(table.widthCm!).toBeLessThanOrEqual(14.05);
  });
});
