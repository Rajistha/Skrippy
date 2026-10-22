import { strFromU8, unzipSync } from "fflate";

/** Batas dari AGENTS.md: ukuran total setelah dekompresi maksimal 200 MB. */
export const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_ENTRY_BYTES = 150 * 1024 * 1024;

/** Hanya berkas ini yang dibaca. Folder word/media tidak pernah diekstrak. */
const WANTED = [
  /^word\/document\.xml$/,
  /^word\/styles\.xml$/,
  /^word\/numbering\.xml$/,
  /^word\/settings\.xml$/,
  /^word\/_rels\/document\.xml\.rels$/,
  /^word\/theme\/theme1\.xml$/,
  /^word\/(footer|header)\d*\.xml$/,
  /^word\/(comments|footnotes)\.xml$/,
  /^docProps\/core\.xml$/,
];

export class DocxFormatError extends Error {
  constructor(
    message: string,
    readonly code: "not_zip" | "too_large" | "missing_document",
  ) {
    super(message);
    this.name = "DocxFormatError";
  }
}

export type DocxParts = {
  document: string;
  styles: string | null;
  rels: string | null;
  theme: string | null;
  comments: string | null;
  footnotes: string | null;
  core: string | null;
  /** Nama berkas ("word/footer1.xml") ke isi XML. */
  headersFooters: Map<string, string>;
};

/**
 * Cegah zip bomb: jumlahkan ukuran asli semua entri dari direktori pusat (tanpa mengekstrak),
 * tolak bila melebihi batas, baru ekstrak berkas yang diperlukan saja.
 */
export function readDocxParts(data: Uint8Array): DocxParts {
  let total = 0;
  try {
    unzipSync(data, {
      filter: (file) => {
        total += file.originalSize;
        return false;
      },
    });
  } catch {
    throw new DocxFormatError("Arsip tidak bisa dibaca.", "not_zip");
  }
  if (total > MAX_UNCOMPRESSED_BYTES) {
    throw new DocxFormatError("Isi file terlalu besar setelah diekstrak.", "too_large");
  }

  const files = unzipSync(data, {
    filter: (file) =>
      file.originalSize <= MAX_ENTRY_BYTES && WANTED.some((re) => re.test(file.name)),
  });

  const documentXml = files["word/document.xml"];
  if (!documentXml) throw new DocxFormatError("word/document.xml tidak ada.", "missing_document");

  const read = (name: string): string | null => {
    const bytes = files[name];
    return bytes ? strFromU8(bytes) : null;
  };

  const headersFooters = new Map<string, string>();
  for (const name of Object.keys(files)) {
    if (/^word\/(footer|header)\d*\.xml$/.test(name))
      headersFooters.set(name, strFromU8(files[name]!));
  }

  return {
    document: strFromU8(documentXml),
    styles: read("word/styles.xml"),
    rels: read("word/_rels/document.xml.rels"),
    theme: read("word/theme/theme1.xml"),
    comments: read("word/comments.xml"),
    footnotes: read("word/footnotes.xml"),
    core: read("docProps/core.xml"),
    headersFooters,
  };
}
