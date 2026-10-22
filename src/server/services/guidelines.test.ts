import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { badFormatDocx } from "@tests/fixtures/build-fixtures";
import { FakeStorage } from "@tests/helpers/fakes";
import { InvalidUpload } from "../errors";
import { buildExtraction, readGuidelineFile, testGuidelineOnManuscript } from "./guidelines";

/** PDF satu halaman berisi teks, dirakit tangan (tabel xref dibangun ulang oleh pembaca). */
function pdfWith(lines: string[]): Uint8Array {
  const stream = `BT /F1 12 Tf 50 750 Td ${lines.map((l) => `(${l}) Tj 0 -16 Td`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

describe("membaca berkas pedoman", () => {
  it("PDF: teks terbaca dan aturan terdeteksi", async () => {
    const text = await readGuidelineFile(
      "pedoman.pdf",
      pdfWith([
        "Naskah diketik pada kertas A4 dengan huruf Times New Roman ukuran 12 pt.",
        "Margin kiri 4 cm, margin atas 3 cm, margin kanan 3 cm, margin bawah 3 cm.",
      ]),
    );
    const { rules, findings } = buildExtraction(text);
    expect(findings.length).toBeGreaterThanOrEqual(5);
    expect(rules).toMatchObject({
      page: { margins_cm: { left: 4, bottom: 3 } },
      body: { font_size_pt: 12 },
    });
  });

  it("menolak ekstensi lain, file kosong, magic bytes salah, dan PDF tanpa teks", async () => {
    await expect(readGuidelineFile("a.txt", new Uint8Array([1]))).rejects.toBeInstanceOf(
      InvalidUpload,
    );
    await expect(readGuidelineFile("a.pdf", new Uint8Array())).rejects.toBeInstanceOf(
      InvalidUpload,
    );
    await expect(
      readGuidelineFile("a.pdf", new TextEncoder().encode("halo")),
    ).rejects.toBeInstanceOf(InvalidUpload);
    await expect(
      readGuidelineFile("a.docx", new TextEncoder().encode("halo")),
    ).rejects.toBeInstanceOf(InvalidUpload);
    await expect(readGuidelineFile("a.pdf", pdfWith(["x"]))).rejects.toBeInstanceOf(InvalidUpload);
  });
});

describe("uji pedoman pada naskah contoh", () => {
  const key = `guidelines/tmp/${randomUUID()}.docx`;

  it("menjalankan aturan yang diberikan, menghitung per aturan, dan menghapus berkas contoh", async () => {
    const storage = new FakeStorage();
    storage.files.set(key, await badFormatDocx());
    const strict = await testGuidelineOnManuscript(storage, key, {});
    expect(strict.issue_count).toBeGreaterThan(0);
    expect(strict.by_rule.find((r) => r.rule_code === "FMT-002")).toBeDefined();
    expect(strict.by_rule[0]!.count).toBeGreaterThanOrEqual(strict.by_rule.at(-1)!.count);
    expect(storage.files.has(key)).toBe(false);

    storage.files.set(key, await badFormatDocx());
    const loose = await testGuidelineOnManuscript(storage, key, {
      disabled_rules: strict.by_rule.map((r) => r.rule_code),
    });
    expect(loose.issue_count).toBe(0);
    expect(loose.score_total).toBe(100);
  });

  it("menolak jalur sembarangan, berkas belum ada, dan berkas rusak", async () => {
    const storage = new FakeStorage();
    await expect(
      testGuidelineOnManuscript(storage, "manuscripts/x.docx", {}),
    ).rejects.toMatchObject({
      code: "validation_error",
    });
    await expect(testGuidelineOnManuscript(storage, key, {})).rejects.toBeInstanceOf(InvalidUpload);
    storage.files.set(key, new TextEncoder().encode("bukan docx"));
    await expect(testGuidelineOnManuscript(storage, key, {})).rejects.toBeInstanceOf(InvalidUpload);
    expect(storage.files.has(key)).toBe(false);
  });
});
