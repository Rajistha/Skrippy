/** Checklist kelengkapan naskah sebelum sidang. Murni: dihitung dari ParsedDocument dan Rules. */
import { chapterRanges } from "./structure/extra";
import { findSections } from "./structure/rules";
import type { ParsedDocument, Rules } from "./types";

/**
 * ok: ada dan terbaca. missing: tidak ditemukan. warn: ada tetapi perlu dicek.
 * manual: tidak bisa dipastikan dari struktur dokumen, pengguna memeriksa sendiri.
 */
export type ChecklistStatus = "ok" | "missing" | "warn" | "manual";

export type ChecklistItem = {
  key: string;
  label: string;
  status: ChecklistStatus;
  /** Keterangan singkat, misalnya "34 sumber" atau "Bab II kurang dari 100 kata". */
  detail?: string;
};

export type Checklist = { items: ChecklistItem[]; done: number; total: number };

const norm = (s: string): string => s.trim().replace(/\s+/g, " ").toUpperCase();

/** "KATA PENGANTAR" -> "Kata Pengantar"; "BAB III" tetap kapital pada angka romawinya. */
function label(name: string): string {
  return name
    .split(/\s+/)
    .map((w, i, all) =>
      i > 0 && all[i - 1]!.toUpperCase() === "BAB" && /^[IVXLC]+$/i.test(w)
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");
}

const FIGURE_WIDTH_MIN_CM = 3;

export function buildChecklist(doc: ParsedDocument, rules: Rules): Checklist {
  const items: ChecklistItem[] = [];
  const required = rules.required_sections;
  const found = findSections(doc, [
    ...required,
    "ABSTRACT",
    "DAFTAR TABEL",
    "DAFTAR GAMBAR",
    "DAFTAR PUSTAKA",
  ]);

  for (const name of required) {
    const key = norm(name);
    const text = label(name);
    if (found.has(name)) {
      items.push({ key, label: text, status: "ok" });
    } else if (key === "HALAMAN JUDUL") {
      // Halaman judul jarang diberi teks "HALAMAN JUDUL", jadi tidak bisa dipastikan otomatis.
      items.push({
        key,
        label: text,
        status: "manual",
        detail: "Periksa sendiri, tidak bisa dideteksi otomatis.",
      });
    } else {
      items.push({ key, label: text, status: "missing", detail: "Judul bagian tidak ditemukan." });
    }
  }

  // Abstrak dua bahasa: hanya relevan bila pedoman mewajibkan abstrak.
  if (required.some((n) => norm(n) === "ABSTRAK")) {
    items.push(
      found.has("ABSTRACT")
        ? { key: "ABSTRACT", label: "Abstract (bahasa Inggris)", status: "ok" }
        : {
            key: "ABSTRACT",
            label: "Abstract (bahasa Inggris)",
            status: "missing",
            detail: "Abstrak berbahasa Inggris tidak ditemukan.",
          },
    );
  }

  // Daftar isi otomatis lebih mudah diperbarui dibanding yang diketik manual.
  if (required.some((n) => norm(n) === "DAFTAR ISI")) {
    const hasLines = doc.paragraphs.some((p) => p.isToc);
    items.push(
      doc.hasTocField
        ? { key: "TOC_AUTO", label: "Daftar isi otomatis", status: "ok" }
        : {
            key: "TOC_AUTO",
            label: "Daftar isi otomatis",
            status: hasLines ? "warn" : "missing",
            detail: hasLines
              ? "Daftar isi diketik manual. Pakai References > Table of Contents agar mudah diperbarui."
              : "Daftar isi tidak ditemukan.",
          },
    );
  }

  const figures = doc.paragraphs.filter(
    (p) => p.hasDrawing && (p.imageWidthCm ?? 99) >= FIGURE_WIDTH_MIN_CM,
  ).length;
  if (doc.tableCount > 0) {
    items.push(
      found.has("DAFTAR TABEL")
        ? {
            key: "DAFTAR TABEL",
            label: "Daftar Tabel",
            status: "ok",
            detail: `${doc.tableCount} tabel`,
          }
        : {
            key: "DAFTAR TABEL",
            label: "Daftar Tabel",
            status: "missing",
            detail: `Naskah memuat ${doc.tableCount} tabel tetapi belum ada daftar tabel.`,
          },
    );
  }
  if (figures > 0) {
    items.push(
      found.has("DAFTAR GAMBAR")
        ? {
            key: "DAFTAR GAMBAR",
            label: "Daftar Gambar",
            status: "ok",
            detail: `${figures} gambar`,
          }
        : {
            key: "DAFTAR GAMBAR",
            label: "Daftar Gambar",
            status: "missing",
            detail: `Naskah memuat ${figures} gambar tetapi belum ada daftar gambar.`,
          },
    );
  }

  // Tiap bab harus berisi, bukan sekadar judul.
  const ranges = chapterRanges(doc, required);
  if (ranges.length > 0) {
    const thin = ranges
      .map((r) => ({
        name: r.name,
        words: doc.paragraphs
          .filter((p) => p.index >= r.start && p.index < r.end && !p.isToc)
          .reduce((n, p) => n + (p.text.match(/[\p{L}\d]+/gu) ?? []).length, 0),
      }))
      .filter((r) => r.words < rules.min_chapter_words);
    items.push(
      thin.length === 0
        ? { key: "CHAPTER_BODY", label: "Setiap bab berisi", status: "ok" }
        : {
            key: "CHAPTER_BODY",
            label: "Setiap bab berisi",
            status: "warn",
            detail: `${thin.map((r) => label(r.name)).join(", ")} kurang dari ${rules.min_chapter_words} kata.`,
          },
    );
  }

  // Penomoran halaman: ada field PAGE di setidaknya satu section.
  if (doc.sections.length > 0) {
    const numbered = doc.sections.filter((s) => s.hasPageNumberField).length;
    items.push(
      numbered > 0
        ? { key: "PAGE_NUMBER", label: "Nomor halaman", status: "ok" }
        : {
            key: "PAGE_NUMBER",
            label: "Nomor halaman",
            status: "missing",
            detail: "Tidak ada nomor halaman di footer.",
          },
    );
  }

  const bibliography = found.get("DAFTAR PUSTAKA");
  if (bibliography) {
    const entries = doc.paragraphs.filter(
      (p) =>
        p.index > bibliography.index &&
        !p.isToc &&
        p.headingLevel === null &&
        !p.isChapterHeading &&
        p.text.trim() !== "",
    ).length;
    items.push(
      entries > 0
        ? {
            key: "BIB_ENTRIES",
            label: "Daftar pustaka berisi sumber",
            status: "ok",
            detail: `${entries} entri`,
          }
        : {
            key: "BIB_ENTRIES",
            label: "Daftar pustaka berisi sumber",
            status: "missing",
            detail: "Judul ada tetapi belum ada entri di bawahnya.",
          },
    );
  }

  // Butir "manual" tidak bisa dipastikan, jadi tidak dihitung ke total.
  const countable = items.filter((i) => i.status !== "manual");
  return {
    items,
    done: countable.filter((i) => i.status === "ok").length,
    total: countable.length,
  };
}
