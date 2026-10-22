import { describe, expect, it } from "vitest";
import { RULE_CODES } from "@/server/checkers/registry";
import { RULE_TITLES, WHOLE_DOCUMENT_RULES, ruleCategory, rulesOf } from "./rule-titles";

describe("judul aturan", () => {
  it("setiap aturan terdaftar punya judul, dan sebaliknya", () => {
    expect(RULE_CODES.filter((c) => !RULE_TITLES[c])).toEqual([]);
    expect(Object.keys(RULE_TITLES).filter((c) => !RULE_CODES.includes(c))).toEqual([]);
  });

  it("pengelompokan kategori dan daftar aturan naskah utuh valid", () => {
    expect(ruleCategory("EJA-003")).toBe("spelling");
    expect(rulesOf("citation")[0]).toBe("SIT-001");
    expect(WHOLE_DOCUMENT_RULES.filter((c) => !RULE_CODES.includes(c))).toEqual([]);
  });
});
