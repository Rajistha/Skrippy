import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { badFormatDocx, body, buildDocx, goodDocx, heading } from "@tests/fixtures/build-fixtures";
import { parseDocx } from "./document";
import { readDocxParts } from "./zip";

describe("parseDocx: gaya efektif", () => {
  it("membaca margin, ukuran kertas, dan section", async () => {
    const doc = parseDocx(await goodDocx());
    expect(doc.sections).toHaveLength(1);
    const s = doc.sections[0]!;
    expect([s.marginLeftCm, s.marginTopCm, s.marginRightCm, s.marginBottomCm]).toEqual([
      4, 4, 3, 3,
    ]);
    expect(s.pageWidthCm).toBeCloseTo(21, 1);
    expect(s.pageHeightCm).toBeCloseTo(29.7, 1);
  });

  it("menyelesaikan font, ukuran, spasi, indentasi, dan perataan dari format langsung", async () => {
    const doc = parseDocx(await goodDocx());
    const p = doc.paragraphs.find((x) => x.text.startsWith("Penelitian"))!;
    expect(p.runs[0]!.fontName).toBe("Times New Roman");
    expect(p.runs[0]!.fontSizePt).toBe(12);
    expect(p.lineSpacing).toBe(1.5);
    expect(p.firstLineIndentCm).toBeCloseTo(1.25, 1);
    expect(p.alignment).toBe("justify");
  });

  it("membaca font default dokumen", async () => {
    const data = await buildDocx({
      font: "Arial",
      sizePt: 10,
      sections: [
        { blocks: [{ kind: "p", text: "Teks tanpa format run eksplisit lainnya di sini." }] },
      ],
    });
    // run-level dari fixture selalu eksplisit; hapus dengan membangun ulang docx tanpa rPr run
    const parts = readDocxParts(data);
    expect(parts.styles).toContain("Arial");
    const doc = parseDocx(data);
    expect(doc.paragraphs[0]!.runs[0]!.fontName).toBe("Arial");
  });

  it("mewarisi lewat rantai basedOn dan gaya default Normal", () => {
    const styles = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Dasar"><w:name w:val="Dasar"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="both"/><w:spacing w:line="360" w:lineRule="auto"/><w:ind w:firstLine="709"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Turunan"><w:name w:val="Turunan"/><w:basedOn w:val="Dasar"/>
    <w:rPr><w:i/></w:rPr></w:style>
</w:styles>`;
    const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
  <w:p><w:r><w:t>Tanpa gaya apa pun</w:t></w:r></w:p>
  <w:p><w:pPr><w:pStyle w:val="Turunan"/></w:pPr><w:r><w:t>Gaya turunan</w:t></w:r></w:p>
  <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:left="2268" w:top="2268" w:right="1701" w:bottom="1701"/></w:sectPr>
</w:body></w:document>`;
    const zip = zipSync({
      "word/document.xml": strToU8(documentXml),
      "word/styles.xml": strToU8(styles),
    });
    const doc = parseDocx(zip);
    const [plain, derived] = doc.paragraphs;
    expect(plain!.runs[0]).toMatchObject({ fontName: "Calibri", fontSizePt: 11, italic: false });
    expect(plain!.lineSpacing).toBe(1);
    expect(derived!.runs[0]).toMatchObject({
      fontName: "Times New Roman",
      fontSizePt: 12,
      italic: true,
    });
    expect(derived!.lineSpacing).toBe(1.5);
    expect(derived!.alignment).toBe("justify");
    expect(derived!.firstLineIndentCm).toBeCloseTo(1.25, 1);
    expect(doc.sections[0]!.marginLeftCm).toBeCloseTo(4, 1);
  });

  it("memakai gaya karakter, spasi tetap diabaikan, dan font tema", () => {
    const theme = `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:fontScheme>
      <a:majorFont><a:latin typeface="Cambria"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/></a:minorFont>
      </a:fontScheme></a:themeElements></a:theme>`;
    const styles = `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi"/></w:rPr></w:rPrDefault></w:docDefaults>
      <w:style w:type="character" w:styleId="Tebal"><w:name w:val="Tebal"/><w:rPr><w:b/></w:rPr></w:style>
    </w:styles>`;
    const documentXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:pPr><w:spacing w:line="400" w:lineRule="exact"/></w:pPr>
        <w:r><w:rPr><w:rStyle w:val="Tebal"/></w:rPr><w:t>tebal</w:t></w:r></w:p>
    </w:body></w:document>`;
    const doc = parseDocx(
      zipSync({
        "word/document.xml": strToU8(documentXml),
        "word/styles.xml": strToU8(styles),
        "word/theme/theme1.xml": strToU8(theme),
      }),
    );
    const p = doc.paragraphs[0]!;
    expect(p.runs[0]).toMatchObject({ bold: true, fontName: "Aptos" });
    expect(p.lineSpacing).toBeNull();
  });
});

describe("parseDocx: heading dan daftar isi", () => {
  it("mendeteksi heading manual tanpa style lewat pola teks BAB", async () => {
    const doc = parseDocx(await buildDocx({ sections: [{ blocks: [heading("BAB II"), body()] }] }));
    expect(doc.paragraphs[0]!.isChapterHeading).toBe(true);
    expect(doc.paragraphs[1]!.isChapterHeading).toBe(false);
  });

  it("baris daftar isi bertitik bukan judul bab", async () => {
    const doc = parseDocx(
      await buildDocx({
        sections: [{ blocks: [{ kind: "p", text: "BAB I PENDAHULUAN ........ 1" }] }],
      }),
    );
    expect(doc.paragraphs[0]!.isToc).toBe(true);
    expect(doc.paragraphs[0]!.isChapterHeading).toBe(false);
  });

  it("mengenali heading dari nama style Word", () => {
    const styles = `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>`;
    const documentXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>2.1 Landasan</w:t></w:r></w:p></w:body></w:document>`;
    const doc = parseDocx(
      zipSync({ "word/document.xml": strToU8(documentXml), "word/styles.xml": strToU8(styles) }),
    );
    expect(doc.paragraphs[0]!.headingLevel).toBe(2);
  });
});

describe("parseDocx: section dan nomor halaman", () => {
  it("membaca format nomor halaman dan field PAGE di footer tiap section", async () => {
    const doc = parseDocx(
      await buildDocx({
        sections: [
          { pageNumber: { format: "lowerRoman" }, blocks: [body("Kata pengantar.")] },
          { pageNumber: { format: "decimal", start: 1 }, blocks: [heading("BAB I"), body()] },
        ],
      }),
    );
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0]).toMatchObject({
      pageNumberFormat: "lowerRoman",
      hasPageNumberField: true,
    });
    expect(doc.sections[1]).toMatchObject({
      pageNumberFormat: "decimal",
      pageNumberStart: 1,
      hasPageNumberField: true,
    });
    expect(doc.paragraphs.find((p) => p.isChapterHeading)!.sectionIndex).toBe(1);
  });

  it("section tanpa footer mewarisi dari section sebelumnya", async () => {
    const doc = parseDocx(
      await buildDocx({
        sections: [{ pageNumber: { format: "decimal" }, blocks: [body()] }, { blocks: [body()] }],
      }),
    );
    expect(doc.sections.map((s) => s.hasPageNumberField)).toEqual([true, true]);
  });
});

describe("parseDocx: halaman", () => {
  const WITH_MARKERS = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
    <w:p><w:r><w:t>Halaman satu</w:t></w:r></w:p>
    <w:p><w:r><w:lastRenderedPageBreak/><w:t>Halaman dua</w:t></w:r></w:p>
    <w:p><w:r><w:t>Masih halaman dua</w:t></w:r></w:p></w:body></w:document>`;

  it("memakai w:lastRenderedPageBreak bila ada", () => {
    const doc = parseDocx(zipSync({ "word/document.xml": strToU8(WITH_MARKERS) }));
    expect(doc.hasPageMarkers).toBe(true);
    expect(doc.paragraphs.map((p) => p.page)).toEqual([1, 2, 2]);
  });

  it("tanpa penanda, page bernilai null dan tidak ditebak", async () => {
    const doc = parseDocx(await goodDocx());
    expect(doc.hasPageMarkers).toBe(false);
    expect(doc.paragraphs.every((p) => p.page === null)).toBe(true);
  });
});

describe("keamanan parser", () => {
  it("menolak XML dengan DTD atau entitas", () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>&x;</w:t></w:r></w:p></w:body></w:document>`;
    expect(() => parseDocx(zipSync({ "word/document.xml": strToU8(xxe) }))).toThrow(/DTD/);
  });

  it("menolak arsip yang tidak memuat word/document.xml", () => {
    expect(() => parseDocx(zipSync({ "lain.txt": strToU8("x") }))).toThrow(/document\.xml/);
  });

  it("tidak mengekstrak folder media", async () => {
    const data = zipSync({
      "word/document.xml": strToU8(
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>`,
      ),
      "word/media/besar.bin": new Uint8Array(1024),
    });
    const parts = readDocxParts(data);
    expect(parts.document).toContain("w:body");
    expect([...parts.headersFooters.keys()]).toEqual([]);
  });

  it("naskah yang melanggar tetap terbaca", async () => {
    const doc = parseDocx(await badFormatDocx());
    expect(doc.sections[0]!.marginLeftCm).toBeCloseTo(3, 1);
  });
});
