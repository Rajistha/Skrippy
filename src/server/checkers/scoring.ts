import type { IssueCategory, Issue, Rules, Severity } from "./types";

export function categoryScore(
  issues: Issue[],
  category: IssueCategory,
  weights: Record<Severity, number>,
): number {
  const penalty = issues
    .filter((i) => i.category === category)
    .reduce((sum, i) => sum + weights[i.severity], 0);
  return Math.max(0, 100 - penalty);
}

/** Skor kategori = 100 dikurangi penalti (minimum 0). Total = rata-rata kategori yang dijalankan. */
export function computeScores(
  issues: Issue[],
  categories: IssueCategory[],
  rules: Rules,
): { total: number; byCategory: Record<string, number> } {
  const byCategory: Record<string, number> = {};
  for (const c of categories) byCategory[c] = categoryScore(issues, c, rules.severity_weights);
  const values = Object.values(byCategory);
  const total =
    values.length === 0
      ? 100
      : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  return { total, byCategory };
}
