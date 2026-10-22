import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildIssuesPdf, type IssuesPdfItem } from "./issues-pdf";

const item = (over: Partial<IssuesPdfItem> = {}): IssuesPdfItem => ({
  severity: "major",
  ruleCode: "EJA-002",
  categoryLabel: "Ejaan",
  message: "Kata tidak baku.",
  suggestion: "Gunakan kata baku.",
  excerpt: "menganalisa",
  location: "BAB I > 1.1, paragraf 3",
  ...over,
});

describe("PDF daftar temuan", () => {
  it("menghasilkan PDF valid dengan ringkasan dan temuan tiap keparahan", async () => {
    const bytes = await buildIssuesPdf({
      title: "Skripsi Uji",
      generatedAt: new Date("2026-10-22T06:00:00Z"),
      versionNo: 2,
      scoreTotal: 61.5,
      categoryScores: [{ label: "Ejaan", score: 37 }],
      issues: [
        item({ severity: "critical", ruleCode: "STR-001", location: "", excerpt: null }),
        item(),
        item({ severity: "minor", suggestion: null }),
      ],
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("ratusan temuan berlanjut ke halaman lain, kata sangat panjang dan karakter asing tidak membuatnya gagal", async () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      item({ message: `Temuan ${i} ${"kalimat ".repeat(30)} 日本語 ${"x".repeat(200)}` }),
    );
    const bytes = await buildIssuesPdf({
      title: "Panjang",
      generatedAt: new Date("2026-10-22T06:00:00Z"),
      versionNo: 1,
      scoreTotal: 0,
      categoryScores: [],
      issues: many,
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(5);
  });

  it("tanpa temuan tetap menghasilkan PDF", async () => {
    const bytes = await buildIssuesPdf({
      title: "Bersih",
      generatedAt: new Date("2026-10-22T06:00:00Z"),
      versionNo: 1,
      scoreTotal: null,
      categoryScores: [],
      issues: [],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
