import { strFromU8, unzipSync } from "fflate";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { buildDocx, buildThesis, type Block } from "@tests/fixtures/build-fixtures";
import { parseDocx } from "../checkers/parse/document";
import { annotateDocx, findTopLevelParagraphs } from "./annotate-docx";

const read = (data: Uint8Array, name: string): string => strFromU8(unzipSync(data)[name]!);

/** Teks paragraf (berurutan) yang memuat awal rentang komentar, per id. */
function anchored(data: Uint8Array): Map<string, string> {
  const xml = read(data, "word/document.xml");
  const out = new Map<string, string>();
  for (const spanText of xml.split(/<w:p[ >]/).slice(1)) {
    const m = /<w:commentRangeStart w:id="(\d+)"/.exec(spanText);
    if (m)
      out.set(m[1]!, [...spanText.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(""));
  }
  return out;
}

const LONG =
  "Penelitian ini bertujuan untuk menganalisis pengaruh aplikasi terhadap kualitas tulisan.";

describe("anotasi docx", () => {
  it("komentar menempel di paragraf yang benar dan dokumen tetap terbaca", async () => {
    const original = await buildThesis({
      abstractWords: 0,
      bodyBySection: { "BAB I": [LONG, `${LONG} Dua.`] },
    });
    const doc = parseDocx(original);
    const target = doc.paragraphs.find((p) => p.text.endsWith("Dua."))!;
    const out = annotateDocx(original, [
      { paragraphIndex: target.index, text: "[FMT-001] Contoh\nSaran: perbaiki" },
    ]);

    const reparsed = parseDocx(out);
    expect(reparsed.paragraphs.map((p) => p.text)).toEqual(doc.paragraphs.map((p) => p.text));
    expect([...anchored(out).values()]).toEqual([target.text]);

    const comments = read(out, "word/comments.xml");
    expect(comments).toContain('w:author="Skrippy"');
    expect(comments).toContain("[FMT-001] Contoh");
    expect(comments).toContain("Saran: perbaiki");
    for (const name of [
      "word/document.xml",
      "word/comments.xml",
      "[Content_Types].xml",
      "word/_rels/document.xml.rels",
    ]) {
      expect(XMLValidator.validate(read(out, name))).toBe(true);
    }
    expect(read(out, "[Content_Types].xml")).toContain("/word/comments.xml");
    expect(read(out, "word/_rels/document.xml.rels")).toContain("relationships/comments");
  });

  it("paragraf di dalam tabel tidak menggeser nomor paragraf", async () => {
    const blocks: Block[] = [
      { kind: "p", text: `${LONG} Sebelum tabel.` },
      { kind: "table" },
      { kind: "p", text: `${LONG} Sesudah tabel.` },
    ];
    const original = await buildDocx({ sections: [{ blocks }] });
    const doc = parseDocx(original);
    const after = doc.paragraphs.find((p) => p.text.endsWith("Sesudah tabel."))!;
    expect(findTopLevelParagraphs(read(original, "word/document.xml"))).toHaveLength(
      doc.paragraphs.length,
    );
    const out = annotateDocx(original, [{ paragraphIndex: after.index, text: "tes" }]);
    expect([...anchored(out).values()]).toEqual([after.text]);
  });

  it("beberapa komentar di satu paragraf, id unik, dan karakter khusus di-escape", async () => {
    const original = await buildThesis({ abstractWords: 0, bodyBySection: { "BAB I": [LONG] } });
    const idx = parseDocx(original).paragraphs.find((p) => p.text === LONG)!.index;
    const out = annotateDocx(original, [
      { paragraphIndex: idx, text: 'Satu <b> & "dua"' },
      { paragraphIndex: idx, text: "Dua" },
    ]);
    const ids = [...read(out, "word/comments.xml").matchAll(/<w:comment w:id="(\d+)"/g)].map(
      (m) => m[1],
    );
    expect(new Set(ids).size).toBe(2);
    expect(read(out, "word/comments.xml")).toContain("Satu &lt;b&gt; &amp; &quot;dua&quot;");
    expect(XMLValidator.validate(read(out, "word/document.xml"))).toBe(true);
    expect(parseDocx(out).paragraphs.find((p) => p.text === LONG)).toBeDefined();
  });

  it("menganotasi dua kali: komentar lama utuh dan id tidak bentrok", async () => {
    const original = await buildThesis({ abstractWords: 0, bodyBySection: { "BAB I": [LONG] } });
    const idx = parseDocx(original).paragraphs.find((p) => p.text === LONG)!.index;
    const once = annotateDocx(original, [{ paragraphIndex: idx, text: "Pertama" }]);
    const twice = annotateDocx(once, [{ paragraphIndex: idx, text: "Kedua" }]);
    const comments = read(twice, "word/comments.xml");
    expect(comments).toContain("Pertama");
    expect(comments).toContain("Kedua");
    const ids = [...comments.matchAll(/<w:comment w:id="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2);
    expect(XMLValidator.validate(comments)).toBe(true);
  });

  it("indeks di luar dokumen diabaikan; tanpa komentar yang sah, berkas dikembalikan apa adanya", async () => {
    const original = await buildThesis({ abstractWords: 0, bodyBySection: { "BAB I": [LONG] } });
    expect(annotateDocx(original, [{ paragraphIndex: 9999, text: "x" }])).toBe(original);
    expect(annotateDocx(original, [])).toBe(original);
  });
});

describe("sorotan docx", () => {
  const fills = (xml: string): string[] =>
    [...xml.matchAll(/<w:shd [^>]*w:fill="([0-9A-F]{6})"/g)].map((m) => m[1]!);

  it("kutipan disorot saja, teks dan isi dokumen tidak berubah, tanpa komentar", async () => {
    const original = await buildThesis({ abstractWords: 0, bodyBySection: { "BAB I": [LONG] } });
    const doc = parseDocx(original);
    const target = doc.paragraphs.find((p) => p.text === LONG)!;
    const out = annotateDocx(
      original,
      [
        {
          paragraphIndex: target.index,
          text: "x",
          severity: "minor",
          excerpt: "menganalisis pengaruh",
        },
      ],
      new Date(),
      { comments: false },
    );
    const xml = read(out, "word/document.xml");
    expect(fills(xml)).toEqual(["B2CCFF"]);
    expect(xml).toMatch(
      /<w:shd [^>]*w:fill="B2CCFF"\/><\/w:rPr><w:t xml:space="preserve">menganalisis pengaruh<\/w:t>/,
    );
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(unzipSync(out)["word/comments.xml"]).toBeUndefined();
    expect(parseDocx(out).paragraphs.map((p) => p.text)).toEqual(doc.paragraphs.map((p) => p.text));
  });

  it("tanpa kutipan yang cocok, seluruh paragraf disorot dengan warna keparahan tertinggi", async () => {
    const original = await buildThesis({ abstractWords: 0, bodyBySection: { "BAB I": [LONG] } });
    const target = parseDocx(original).paragraphs.find((p) => p.text === LONG)!;
    const out = annotateDocx(
      original,
      [
        { paragraphIndex: target.index, text: "a", severity: "minor" },
        {
          paragraphIndex: target.index,
          text: "b",
          severity: "critical",
          excerpt: "tidak ada di teks",
        },
      ],
      new Date(),
      { comments: false },
    );
    const xml = read(out, "word/document.xml");
    expect(fills(xml).length).toBeGreaterThan(0);
    expect(new Set(fills(xml))).toEqual(new Set(["FDA29B"]));
    expect(XMLValidator.validate(xml)).toBe(true);
  });
});
