/** Validasi .docx di server: ekstensi, magic bytes, struktur, ukuran, zip bomb, enkripsi. */
import { unzipSync } from "fflate";
import { InvalidUpload } from "../errors";
import { MAX_UNCOMPRESSED_BYTES } from "../checkers/parse/zip";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]; // docx terenkripsi dibungkus OLE, bukan ZIP

const startsWith = (data: Uint8Array, magic: number[]): boolean =>
  magic.every((b, i) => data[i] === b);

export function validateDocx(filename: string, data: Uint8Array, maxBytes: number): void {
  if (!filename.toLowerCase().endsWith(".docx"))
    throw new InvalidUpload("Hanya file .docx yang bisa diunggah.");
  if (data.length === 0) throw new InvalidUpload("File kosong. Pilih file lain.");
  if (data.length > maxBytes) {
    throw new InvalidUpload(`Ukuran file melebihi ${Math.floor(maxBytes / (1024 * 1024))} MB.`);
  }
  if (startsWith(data, OLE_MAGIC)) {
    throw new InvalidUpload(
      "File ini terkunci kata sandi. Buka kuncinya di Word, lalu unggah lagi.",
    );
  }
  if (!startsWith(data, ZIP_MAGIC))
    throw new InvalidUpload("File bukan dokumen Word (.docx) yang valid.");

  const names: string[] = [];
  let total = 0;
  try {
    // Hanya membaca direktori pusat: tidak ada yang diekstrak.
    unzipSync(data, {
      filter: (file) => {
        names.push(file.name);
        total += file.originalSize;
        return false;
      },
    });
  } catch {
    throw new InvalidUpload("File rusak. Simpan ulang dari Word, lalu unggah lagi.");
  }
  if (!names.includes("word/document.xml"))
    throw new InvalidUpload("File bukan dokumen Word (.docx) yang valid.");
  if (total > MAX_UNCOMPRESSED_BYTES)
    throw new InvalidUpload("Isi file terlalu besar setelah diekstrak.");
}
