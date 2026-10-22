import type { Checker, Issue } from "../types";
import { bodyParagraphs } from "../types";

const MAX_PER_RULE = 25;

/** Kalimat terlalu panjang (lebih dari `max_sentence_words` kata). */
export const longSentence: Checker = {
  code: "EJA-010",
  category: "spelling",
  defaultSeverity: "minor",
  run(doc, rules) {
    const limit = rules.max_sentence_words;
    const issues: Issue[] = [];
    for (const p of bodyParagraphs(doc)) {
      for (const sentence of p.text.split(/(?<=[.!?])\s+/)) {
        const count = sentence.trim().split(/\s+/).filter(Boolean).length;
        if (count <= limit) continue;
        const start = Math.max(0, p.text.indexOf(sentence));
        issues.push({
          category: "spelling",
          ruleCode: this.code,
          severity: this.defaultSeverity,
          message: `Kalimat terdiri dari ${count} kata, sebaiknya tidak lebih dari ${limit} kata.`,
          suggestion: "Pecah menjadi dua kalimat atau lebih.",
          excerpt: sentence.trim().slice(0, 200),
          location: {
            paragraphIndex: p.index,
            page: p.page,
            charStart: start,
            charEnd: start + sentence.length,
          },
        });
        break; // satu temuan per paragraf cukup
      }
    }
    return issues.slice(0, MAX_PER_RULE);
  },
};

export const spellingExtraCheckers: Checker[] = [longSentence];

export type { Issue };
