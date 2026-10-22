import { describe, expect, it } from "vitest";
import { applyIgnores, ignoreKey } from "./ignore";
import type { Issue } from "./types";

const issue = (rule: string, message: string, excerpt?: string): Issue => ({
  category: "spelling",
  ruleCode: rule,
  severity: "minor",
  message,
  excerpt,
});

describe("daftar abaikan", () => {
  it("kuncinya memakai kata dalam tanda kutip pada pesan, bukan kutipan sekitarnya", () => {
    const a = issue(
      "EJA-001",
      'Kata tidak baku "Analisa", seharusnya "analisis".',
      "hasil Analisa data",
    );
    expect(ignoreKey(a)).toBe("analisa");
  });

  it("membuang hanya temuan dengan aturan dan teks yang sama", () => {
    const list = [
      issue("EJA-001", 'Kata tidak baku "analisa", seharusnya "analisis".'),
      issue("EJA-001", 'Kata tidak baku "resiko", seharusnya "risiko".'),
      issue("EJA-006", 'Istilah asing "analisa" belum dicetak miring.'),
    ];
    const out = applyIgnores(list, [{ ruleCode: "EJA-001", text: "analisa" }]);
    expect(out.map((i) => i.ruleCode + i.message.length)).toHaveLength(2);
    expect(out.some((i) => i.message.includes('"resiko"'))).toBe(true);
    expect(out.some((i) => i.ruleCode === "EJA-006")).toBe(true);
  });

  it("tanpa entri semua temuan dipertahankan", () => {
    const list = [issue("EJA-003", "Ada spasi ganda.")];
    expect(applyIgnores(list, [])).toBe(list);
  });
});
