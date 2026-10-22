import { t } from "./i18n/id";
import type { Issue } from "./types";

export type ChapterRow = { chapter: string; total: number; open: number };

/** Kemajuan perbaikan per bab: temuan yang sudah ditangani (diabaikan atau ditandai) dibanding seluruhnya. */
export function chapterProgress(issues: Issue[]): ChapterRow[] {
  const rows = new Map<string, ChapterRow>();
  for (const i of issues) {
    const path = Array.isArray(i.location.heading_path)
      ? (i.location.heading_path as string[])
      : [];
    const chapter = path[0] ?? t.report.progress.general;
    const row = rows.get(chapter) ?? { chapter, total: 0, open: 0 };
    row.total++;
    if (i.user_status === "open") row.open++;
    rows.set(chapter, row);
  }
  return [...rows.values()];
}
