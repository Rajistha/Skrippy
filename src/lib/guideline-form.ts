/** Pemetaan antara aturan pedoman (JSON) dan nilai formulir admin (semua string). */

export type GuidelineFormValues = {
  name: string;
  campus: string;
  citation: string;
  left: string;
  top: string;
  right: string;
  bottom: string;
  tolerance: string;
  paper: string;
  font: string;
  size: string;
  spacing: string;
  indent: string;
  align: string;
  absMin: string;
  absMax: string;
  maxAge: string;
  tablePos: string;
  figurePos: string;
  sections: string;
};

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {};
const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

export function rulesToForm(
  base: { name?: string; campus?: string | null; citation?: string },
  rules: Json,
): GuidelineFormValues {
  const page = obj(rules.page);
  const m = obj(page.margins_cm);
  const body = obj(rules.body);
  const abs = obj(rules.abstract_words);
  const cap = obj(rules.captions);
  const cite = obj(rules.citation);
  const spacing = body.line_spacing;
  return {
    name: base.name ?? "",
    campus: base.campus ?? "",
    citation: base.citation || str(cite.style) || "apa",
    left: str(m.left),
    top: str(m.top),
    right: str(m.right),
    bottom: str(m.bottom),
    tolerance: str(page.margin_tolerance_cm),
    paper: str(page.size),
    font: str(body.font_family),
    size: str(body.font_size_pt),
    spacing: Array.isArray(spacing) ? spacing.join("; ") : str(spacing),
    indent: str(body.first_line_indent_cm),
    align: str(body.alignment) || "justify",
    absMin: str(abs.min),
    absMax: str(abs.max),
    maxAge: str(cite.max_source_age_years),
    tablePos: str(cap.table_position) || "above",
    figurePos: str(cap.figure_position) || "below",
    sections: Array.isArray(rules.required_sections)
      ? (rules.required_sections as string[]).join("\n")
      : "",
  };
}

const toNum = (s: string): number => Number(s.trim().replace(",", "."));

type NumField = { key: keyof GuidelineFormValues; label: string; min: number; max: number };
export const NUMBER_FIELDS: NumField[] = [
  { key: "left", label: "Margin kiri", min: 0.5, max: 10 },
  { key: "top", label: "Margin atas", min: 0.5, max: 10 },
  { key: "right", label: "Margin kanan", min: 0.5, max: 10 },
  { key: "bottom", label: "Margin bawah", min: 0.5, max: 10 },
  { key: "tolerance", label: "Toleransi margin", min: 0, max: 2 },
  { key: "size", label: "Ukuran huruf", min: 8, max: 20 },
  { key: "indent", label: "Indentasi", min: 0, max: 5 },
  { key: "absMin", label: "Abstrak minimal", min: 0, max: 2000 },
  { key: "absMax", label: "Abstrak maksimal", min: 1, max: 5000 },
  { key: "maxAge", label: "Usia sumber maksimal", min: 1, max: 50 },
];

/** Galat per kolom; kosong berarti valid. Kolom angka boleh dikosongkan (diisi default). */
export function validateForm(
  v: GuidelineFormValues,
): Partial<Record<keyof GuidelineFormValues, string>> {
  const errors: Partial<Record<keyof GuidelineFormValues, string>> = {};
  if (v.name.trim().length < 3) errors.name = "Nama pedoman minimal 3 karakter.";
  for (const f of NUMBER_FIELDS) {
    const raw = v[f.key].trim();
    if (raw === "") continue;
    const n = toNum(raw);
    if (!Number.isFinite(n) || n < f.min || n > f.max)
      errors[f.key] = `${f.label}: isi angka ${f.min} sampai ${f.max}.`;
  }
  const spacing = v.spacing.trim();
  if (spacing !== "") {
    const parts = spacing.split(/[;/]/).map((p) => toNum(p));
    if (parts.some((n) => !Number.isFinite(n) || n < 1 || n > 3) || parts.length > 4) {
      errors.spacing =
        "Spasi: isi angka 1 sampai 3, pisahkan dengan titik koma bila ada dua pilihan.";
    }
  }
  if (v.absMin.trim() && v.absMax.trim() && toNum(v.absMin) > toNum(v.absMax)) {
    errors.absMax = "Abstrak maksimal harus lebih besar dari minimal.";
  }
  return errors;
}

/** Hanya kolom yang terisi yang masuk; sisanya diisi default oleh server. */
export function formToRules(v: GuidelineFormValues): Json {
  const set = (
    target: Json,
    key: string,
    raw: string,
    parse: (s: string) => unknown = toNum,
  ): void => {
    if (raw.trim() !== "") target[key] = parse(raw);
  };
  const margins: Json = {};
  set(margins, "left", v.left);
  set(margins, "top", v.top);
  set(margins, "right", v.right);
  set(margins, "bottom", v.bottom);
  const page: Json = {};
  if (Object.keys(margins).length > 0) page.margins_cm = margins;
  set(page, "margin_tolerance_cm", v.tolerance);
  set(page, "size", v.paper, (s) => s.trim());

  const body: Json = {};
  set(body, "font_family", v.font, (s) => s.trim());
  set(body, "font_size_pt", v.size);
  set(body, "line_spacing", v.spacing, (s) => {
    const parts = s.split(/[;/]/).map((p) => toNum(p));
    return parts.length === 1 ? parts[0] : parts;
  });
  set(body, "first_line_indent_cm", v.indent);
  body.alignment = v.align;

  const abstract: Json = {};
  set(abstract, "min", v.absMin);
  set(abstract, "max", v.absMax);
  const citation: Json = { style: v.citation };
  set(citation, "max_source_age_years", v.maxAge);

  const rules: Json = {
    page,
    body,
    abstract_words: abstract,
    citation,
    captions: { table_position: v.tablePos, figure_position: v.figurePos },
  };
  const sections = v.sections
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (sections.length > 0) rules.required_sections = sections;
  return rules;
}
