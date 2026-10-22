import { describe, expect, it } from "vitest";
import { RULE_CODES } from "@/server/checkers/registry";
import { RULE_HELP } from "./rule-help";

describe("penjelasan aturan", () => {
  it("setiap aturan terdaftar punya penjelasan alasan dan cara memperbaiki", () => {
    const missing = RULE_CODES.filter((c) => !RULE_HELP[c]);
    expect(missing).toEqual([]);
    for (const [code, help] of Object.entries(RULE_HELP)) {
      expect(help.why.length, code).toBeGreaterThan(10);
      expect(help.how.length, code).toBeGreaterThan(10);
    }
  });
});
