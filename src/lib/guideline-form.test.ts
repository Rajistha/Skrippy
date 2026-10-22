import { describe, expect, it } from "vitest";
import { formToRules, rulesToForm, validateForm } from "./guideline-form";

const rules = {
  page: {
    size: "A4",
    margins_cm: { left: 4, top: 3, right: 3, bottom: 3 },
    margin_tolerance_cm: 0.2,
  },
  body: {
    font_family: "Times New Roman",
    font_size_pt: 12,
    line_spacing: [1.5, 2],
    first_line_indent_cm: 1.25,
    alignment: "justify",
  },
  abstract_words: { min: 150, max: 300 },
  citation: { style: "apa", max_source_age_years: 10 },
  captions: { table_position: "above", figure_position: "below" },
  required_sections: ["ABSTRAK", "BAB I"],
};

describe("formulir pedoman", () => {
  it("aturan ke formulir ke aturan tidak mengubah nilai", () => {
    const form = rulesToForm({ name: "Uji" }, rules);
    expect(form.spacing).toBe("1.5; 2");
    expect(form.sections).toBe("ABSTRAK\nBAB I");
    expect(formToRules(form)).toMatchObject(rules);
  });

  it("satu nilai spasi menjadi angka, bukan larik; koma desimal diterima", () => {
    const form = { ...rulesToForm({ name: "Uji" }, rules), spacing: "1,5", left: "3,5" };
    expect(formToRules({ ...form, spacing: "1,5; 2" })).toMatchObject({
      body: { line_spacing: [1.5, 2] },
    });
    const out = formToRules(form) as {
      body: { line_spacing: unknown };
      page: { margins_cm: { left: number } };
    };
    expect(out.body.line_spacing).toBe(1.5);
    expect(out.page.margins_cm.left).toBe(3.5);
  });

  it("kolom angka kosong tidak dikirim (diisi default server)", () => {
    const form = { ...rulesToForm({ name: "Uji" }, rules), left: "", size: "" };
    const out = formToRules(form) as {
      body: Record<string, unknown>;
      page: { margins_cm: Record<string, unknown> };
    };
    expect("left" in out.page.margins_cm).toBe(false);
    expect("font_size_pt" in out.body).toBe(false);
  });

  it("validasi: nama pendek, angka di luar batas, spasi salah, abstrak terbalik", () => {
    const bad = {
      ...rulesToForm({ name: "ab" }, rules),
      left: "99",
      spacing: "5",
      absMin: "400",
      absMax: "100",
      size: "abc",
    };
    expect(Object.keys(validateForm(bad)).sort()).toEqual([
      "absMax",
      "left",
      "name",
      "size",
      "spacing",
    ]);
    expect(validateForm(rulesToForm({ name: "Pedoman sah" }, rules))).toEqual({});
  });
});
