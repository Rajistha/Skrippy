/** Temuan yang diminta pengguna untuk selalu diabaikan. Murni. */
import type { Issue } from "./types";

export type IgnoreEntry = { ruleCode: string; text: string };

/** Teks kunci sebuah temuan: kutipan, atau pesan bila tanpa kutipan. Dinormalkan agar cocok antarcek. */
export function ignoreKey(issue: Pick<Issue, "excerpt" | "message">): string {
  const base = issue.message.match(/"([^"]{1,80})"/)?.[1] ?? issue.excerpt ?? issue.message;
  return base.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
}

export function applyIgnores(issues: Issue[], entries: IgnoreEntry[]): Issue[] {
  if (entries.length === 0) return issues;
  const set = new Set(entries.map((e) => `${e.ruleCode}|${e.text}`));
  return issues.filter((i) => !set.has(`${i.ruleCode}|${ignoreKey(i)}`));
}
