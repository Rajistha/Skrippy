import { citationExtraCheckers } from "./citation/extra";
import { citationCheckers } from "./citation/rules";
import { formatExtraCheckers } from "./format/extra";
import { formatCheckers } from "./format/rules";
import { spellingExtraCheckers } from "./spelling/extra";
import { spellingCheckers } from "./spelling/rules";
import { structureExtraCheckers } from "./structure/extra";
import { structureCheckers } from "./structure/rules";
import type { Category, Checker, Issue, ParsedDocument, Rules } from "./types";

const REGISTRY: Record<Category, Checker[]> = {
  format: [...formatCheckers, ...formatExtraCheckers],
  structure: [...structureCheckers, ...structureExtraCheckers],
  spelling: [...spellingCheckers, ...spellingExtraCheckers],
  citation: [...citationCheckers, ...citationExtraCheckers],
};

/** Kode semua aturan terdaftar, untuk pengecekan kelengkapan penjelasan aturan. */
export const RULE_CODES: string[] = Object.values(REGISTRY).flatMap((list) =>
  list.map((c) => c.code),
);

export function runChecks(doc: ParsedDocument, rules: Rules, categories: Category[]): Issue[] {
  const disabled = new Set(rules.disabled_rules);
  const issues: Issue[] = [];
  for (const category of categories) {
    for (const checker of REGISTRY[category]) {
      if (disabled.has(checker.code)) continue;
      issues.push(...checker.run(doc, rules));
    }
  }
  return issues.map((i) =>
    i.excerpt && i.excerpt.length > 300 ? { ...i, excerpt: `${i.excerpt.slice(0, 299)}…` } : i,
  );
}
