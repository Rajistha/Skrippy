import { describe, expect, it } from "vitest";
import { topPriorities } from "./priorities";
import type { Issue } from "./types";

const issue = (rule: string, severity: string, status = "open"): Issue =>
  ({
    id: `${rule}-${Math.random()}`,
    category: "format",
    rule_code: rule,
    severity,
    message: `Pesan ${rule}`,
    suggestion: null,
    excerpt: null,
    location: {},
    user_status: status,
  }) as unknown as Issue;

describe("prioritas perbaikan", () => {
  it("mengurutkan aturan menurut bobot temuan terbuka dan mengabaikan yang sudah ditangani", () => {
    const list = [
      issue("EJA-003", "minor"),
      issue("EJA-003", "minor"),
      issue("EJA-003", "minor"),
      issue("FMT-002", "critical"),
      issue("SIT-001", "major"),
      issue("SIT-001", "major"),
      issue("STR-005", "critical", "ignored"),
    ];
    const top = topPriorities(list, 3);
    expect(top.map((p) => p.ruleCode)).toEqual(["FMT-002", "SIT-001", "EJA-003"]);
    expect(top[1]).toMatchObject({ count: 2, severity: "major" });
    expect(top[0]!.how).toContain("Margins");
  });

  it("daftar kosong menghasilkan daftar kosong", () => {
    expect(topPriorities([])).toEqual([]);
  });
});
