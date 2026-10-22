import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  buildHighlightPdf,
  computeFlaggedShare,
  formatPercent,
  type HighlightIssue,
  type HighlightParagraph,
} from "./highlight-pdf";

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
      generatedAt: new Date("2026-10-22T06:00:00Z"),
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
      generatedAt: new Date("2026-10-22T06:00:00Z"),
      versionNo: 1,
      paragraphs: long,
      issues: [issue({ paragraphIndex: 100, excerpt: "tidak ada" })],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(3);
  });

  it("tanpa temuan tetap menghasilkan PDF", async () => {
    const bytes = await buildHighlightPdf({
      title: "Bersih",
      generatedAt: new Date("2026-10-22T06:00:00Z"),
      versionNo: 1,
      paragraphs: [para(0, "Isi.")],
      issues: [],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});

describe("persentase teks bermasalah", () => {
  const paragraphs = [
    para(0, "Daftar isi 1", "toc"),
    para(1, "aaaaaaaaaa"), // 10 karakter
    para(2, "bbbbbbbbbb"), // 10 karakter
  ];

  it("menghitung karakter tersorot dari kutipan, dan daftar isi tidak dihitung", () => {
    const share = computeFlaggedShare({
      paragraphs,
      issues: [issue({ paragraphIndex: 1, excerpt: "aaaaa", severity: "major" })],
    });
    expect(share.totalChars).toBe(20);
    expect(share.flaggedChars).toBe(5);
    expect(share.percent).toBeCloseTo(25);
    expect(share.bySeverity.major).toBeCloseTo(25);
  });

  it("kutipan yang tidak ketemu menyorot seluruh paragraf, dan tingkat terparah menang", () => {
    const share = computeFlaggedShare({
      paragraphs,
      issues: [
        issue({ paragraphIndex: 2, excerpt: null, severity: "minor" }),
        issue({ paragraphIndex: 2, excerpt: "bbbb", severity: "critical" }),
      ],
    });
    expect(share.flaggedChars).toBe(10);
    expect(share.bySeverity.critical).toBeCloseTo(20);
    expect(share.bySeverity.minor).toBeCloseTo(30);
    expect(share.percent).toBeCloseTo(50);
  });

  it("temuan tanpa letak dan naskah kosong tidak membuatnya error", () => {
    expect(computeFlaggedShare({ paragraphs: [], issues: [issue()] }).percent).toBe(0);
    expect(
      computeFlaggedShare({ paragraphs, issues: [issue({ paragraphIndex: null })] }).percent,
    ).toBe(0);
  });

  it("format persentase memakai koma Indonesia", () => {
    expect(formatPercent(12.44)).toBe("12,4%");
    expect(formatPercent(0)).toBe("0,0%");
    expect(formatPercent(0.01)).toBe("<0,1%");
  });
});
