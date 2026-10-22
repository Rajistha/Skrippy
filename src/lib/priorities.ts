import { ruleHelp } from "./rule-help";
import type { Issue } from "./types";

const WEIGHT: Record<string, number> = { critical: 10, major: 3, minor: 1 };
const ORDER = ["critical", "major", "minor"];

export type Priority = {
  ruleCode: string;
  count: number;
  severity: string;
  /** Pesan temuan pertama dari aturan ini, sebagai contoh. */
  example: string;
  how: string | null;
};

/** Ringkasan prioritas: aturan dengan bobot temuan terbuka terbesar. Murni dari data temuan. */
export function topPriorities(issues: Issue[], limit = 5): Priority[] {
  const groups = new Map<string, { issues: Issue[]; score: number }>();
  for (const i of issues) {
    if (i.user_status !== "open") continue;
    const g = groups.get(i.rule_code) ?? { issues: [], score: 0 };
    g.issues.push(i);
    g.score += WEIGHT[i.severity] ?? 1;
    groups.set(i.rule_code, g);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([ruleCode, g]) => ({
      ruleCode,
      count: g.issues.length,
      severity: [...g.issues].sort(
        (a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity),
      )[0]!.severity,
      example: g.issues[0]!.message,
      how: ruleHelp(ruleCode)?.how ?? null,
    }));
}
