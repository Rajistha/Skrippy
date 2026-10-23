import { describe, expect, it } from "vitest";
import { buildThesis } from "@tests/fixtures/build-fixtures";
import { buildChecklist } from "./checklist";
import { parseDocx } from "./parse/document";
import { resolveRules } from "./rules";

const statusOf = (list: ReturnType<typeof buildChecklist>, key: string) =>
  list.items.find((i) => i.key === key)?.status;

describe("checklist kelengkapan sidang", () => {
  it("naskah lengkap: semua bagian wajib terdaftar, halaman judul dicek manual", async () => {
    const doc = parseDocx(
      await buildThesis({ references: ["Adams, B. (2020). Judul. Penerbit."] }),
    );
    const list = buildChecklist(doc, resolveRules());
    for (const key of ["LEMBAR PENGESAHAN", "ABSTRAK", "BAB I", "BAB V", "DAFTAR PUSTAKA"])
      expect(statusOf(list, key)).toBe("ok");
    expect(statusOf(list, "HALAMAN JUDUL")).toBe("manual");
    expect(statusOf(list, "BIB_ENTRIES")).toBe("ok");
    expect(statusOf(list, "CHAPTER_BODY")).toBe("ok");
    // butir manual tidak dihitung ke total
    expect(list.total).toBe(list.items.filter((i) => i.status !== "manual").length);
  });

  it("bagian yang hilang ditandai belum ada, dan abstrak bahasa Inggris dicari terpisah", async () => {
    const doc = parseDocx(await buildThesis({ omit: ["KATA PENGANTAR", "BAB III"] }));
    const list = buildChecklist(doc, resolveRules());
    expect(statusOf(list, "KATA PENGANTAR")).toBe("missing");
    expect(statusOf(list, "BAB III")).toBe("missing");
    expect(statusOf(list, "ABSTRACT")).toBe("missing");
    expect(list.done).toBeLessThan(list.total);

    const withEnglish = parseDocx(
      await buildThesis({
        order: [
          "LEMBAR PENGESAHAN",
          "ABSTRAK",
          "ABSTRACT",
          "KATA PENGANTAR",
          "DAFTAR ISI",
          "BAB I",
          "BAB II",
          "BAB III",
          "BAB IV",
          "BAB V",
          "DAFTAR PUSTAKA",
        ],
      }),
    );
    expect(statusOf(buildChecklist(withEnglish, resolveRules()), "ABSTRACT")).toBe("ok");
  });

  it("daftar isi manual diberi peringatan, dan daftar pustaka kosong ditandai belum ada", async () => {
    const doc = parseDocx(await buildThesis({ tocEntries: ["BAB I Pendahuluan ..... 1"] }));
    const list = buildChecklist(doc, resolveRules());
    expect(statusOf(list, "TOC_AUTO")).toBe("warn");
    expect(statusOf(list, "BIB_ENTRIES")).toBe("missing");
  });

  it("bab yang hanya berisi judul ditandai perlu dicek", async () => {
    const doc = parseDocx(await buildThesis({ bodyBySection: { "BAB II": ["Singkat saja."] } }));
    const item = buildChecklist(doc, resolveRules()).items.find((i) => i.key === "CHAPTER_BODY")!;
    expect(item.status).toBe("warn");
    expect(item.detail).toContain("Bab II");
  });
});
