import { describe, expect, it } from "vitest";
import { chapterProgress } from "./chapter-progress";
import type { Issue } from "./types";

const issue = (chapter: string | null, status: string): Issue =>
  ({
    id: Math.random().toString(),
    location: chapter ? { heading_path: [chapter, "1.1 Sub"] } : {},
    user_status: status,
  }) as unknown as Issue;

describe("kemajuan per bab", () => {
  it("menghitung temuan terbuka dan total per bab, dengan kelompok umum untuk yang tanpa bab", () => {
    const rows = chapterProgress([
      issue("BAB I", "open"),
      issue("BAB I", "ignored"),
      issue("BAB II", "done"),
      issue(null, "open"),
    ]);
    expect(rows).toEqual([
      { chapter: "BAB I", total: 2, open: 1 },
      { chapter: "BAB II", total: 1, open: 0 },
      { chapter: "Seluruh naskah", total: 1, open: 1 },
    ]);
  });

  it("tanpa temuan hasilnya kosong", () => {
    expect(chapterProgress([])).toEqual([]);
  });
});
