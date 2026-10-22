import { describe, expect, it } from "vitest";
import { buildThesis } from "@tests/fixtures/build-fixtures";
import { parseDocx } from "./parse/document";
import { resolveRules } from "./rules";
import { computeStats } from "./stats";

describe("statistik naskah", () => {
  it("menghitung kata per bab, sitasi, keterbacaan, dan umur sumber", async () => {
    const year = new Date().getUTCFullYear();
    const doc = parseDocx(
      await buildThesis({
        bodyBySection: {
          "BAB I": ["Data diambil oleh peneliti (Adams, 2020). Hasil dibahas kemudian."],
        },
        references: [
          `Adams, B. (${year - 1}). Judul satu. Penerbit.`,
          "Budi, C. (2001). Judul dua. Penerbit.",
          `Citra, D. (${year - 2}). Judul tiga. Penerbit.`,
        ],
      }),
    );
    const stats = computeStats(doc, resolveRules());
    expect(stats.chapters.map((c) => c.name)).toEqual([
      "BAB I",
      "BAB II",
      "BAB III",
      "BAB IV",
      "BAB V",
    ]);
    expect(stats.chapters[0]).toMatchObject({ words: 9, citations: 1 });
    expect(stats.chapters[1]!.words).toBeGreaterThan(100);
    expect(stats.sources).toMatchObject({ total: 3, recentPct: 67 });
    expect(stats.readability.sentences).toBeGreaterThan(10);
    expect(stats.readability.passivePct).toBeGreaterThan(0);
  });
});
