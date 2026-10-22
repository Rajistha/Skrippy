import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildHighlightPdf, type HighlightIssue, type HighlightParagraph } from "./highlight-pdf";

const para = (
  index: number,
  text: string,
  kind: HighlightParagraph["kind"] = "body",
): HighlightParagraph => ({
  index,
  text,
  kind,
  align: kind === "heading" ? "center" : "left",
});
const issue = (over: Partial<HighlightIssue> = {}): HighlightIssue => ({
  severity: "major",
  ruleCode: "EJA-002",
  message: "Kata tidak baku.",
  suggestion: "Gunakan kata baku.",
  excerpt: "menganalisa",
  paragraphIndex: 1,
  ...over,
});

describe("PDF naskah bersorot", () => {
  it("menghasilkan PDF yang valid dengan teks, sorotan, dan temuan tanpa letak", async () => {
    const bytes = await buildHighlightPdf({
      title: "Skripsi Uji",
      versionNo: 2,
      paragraphs: [
        para(0, "BAB I PENDAHULUAN", "heading"),
        para(1, "Mahasiswa menganalisa data dengan cara yang kurang efektif."),
      ],
      issues: [
        issue(),
        issue({
          severity: "critical",
          excerpt: null,
          paragraphIndex: null,
          ruleCode: "STR-001",
          message: "Bagian wajib tidak ditemukan.",
        }),
      ],
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("naskah panjang berlanjut ke halaman berikutnya dan karakter asing tidak membuatnya gagal", async () => {
    const long = Array.from({ length: 120 }, (_, i) =>
      para(i, `Paragraf ${i} ${"kata ".repeat(60)} 日本語`),
    );
    const bytes = await buildHighlightPdf({
      title: "Panjang",
      versionNo: 1,
      paragraphs: long,
      issues: [issue({ paragraphIndex: 100, excerpt: "tidak ada" })],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(3);
  });

  it("tanpa temuan tetap menghasilkan PDF", async () => {
    const bytes = await buildHighlightPdf({
      title: "Bersih",
      versionNo: 1,
      paragraphs: [para(0, "Isi.")],
      issues: [],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
