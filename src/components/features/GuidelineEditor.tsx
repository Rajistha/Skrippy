"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { FormActions, FormSection } from "@/components/ui/FormSection";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import {
  formToRules,
  rulesToForm,
  validateForm,
  type GuidelineFormValues,
} from "@/lib/guideline-form";
import { t } from "@/lib/i18n/id";
import type { AdminGuideline, GuidelineExtraction, GuidelineIn } from "@/lib/schemas";
import { putToSignedUrl } from "@/lib/upload";
import { GuidelineTester } from "./GuidelineTester";

const msg = (e: unknown) => toApiError(e).message;
const MAX_FILE = 15 * 1024 * 1024;
const CITATION_STYLES = ["apa", "ieee", "harvard", "chicago", "vancouver", "mla"];

/** Kolom formulir -> jalur aturan, untuk menampilkan kutipan sumber di bawah kolom yang terdeteksi. */
const PATH_OF: Partial<Record<keyof GuidelineFormValues, string>> = {
  left: "page.margins_cm.left",
  top: "page.margins_cm.top",
  right: "page.margins_cm.right",
  bottom: "page.margins_cm.bottom",
  paper: "page.size",
  font: "body.font_family",
  size: "body.font_size_pt",
  spacing: "body.line_spacing",
  indent: "body.first_line_indent_cm",
  align: "body.alignment",
  absMin: "abstract_words.min",
  absMax: "abstract_words.max",
  maxAge: "citation.max_source_age_years",
  tablePos: "captions.table_position",
  figurePos: "captions.figure_position",
  citation: "citation.style",
};

type ReadState = "idle" | "uploading" | "reading" | "done";

export function GuidelineEditor({ initial }: { initial?: AdminGuideline }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<GuidelineFormValues>(() =>
    rulesToForm(
      { name: initial?.name, campus: initial?.campus_name, citation: initial?.citation_style },
      initial?.rules ?? {},
    ),
  );
  const [errors, setErrors] = useState<Partial<Record<keyof GuidelineFormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "published" | null>(null);

  const [readState, setReadState] = useState<ReadState>("idle");
  const [progress, setProgress] = useState(0);
  const [readError, setReadError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [extraction, setExtraction] = useState<GuidelineExtraction | null>(null);

  const evidence = new Map(extraction?.findings.map((f) => [f.path, f.evidence]));
  const set = (key: keyof GuidelineFormValues, value: string): void => {
    setValues((cur) => ({ ...cur, [key]: value }));
    setErrors((cur) => ({ ...cur, [key]: undefined }));
  };
  /** Pada kolom yang terdeteksi, tampilkan dari kalimat mana nilai itu berasal. */
  const hint = (key: keyof GuidelineFormValues): string | undefined => {
    const path = PATH_OF[key];
    const text = path ? evidence.get(path) : undefined;
    return text ? `Terdeteksi dari pedoman: "${text}"` : undefined;
  };

  async function readFile(file: File) {
    setReadError(null);
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".pdf") && !lower.endsWith(".docx"))
      return setReadError(t.guidelines.badType);
    if (file.size > MAX_FILE) return setReadError(t.guidelines.tooBig);
    setFileName(file.name);
    setReadState("uploading");
    setProgress(0);
    const start = await api.POST("/admin/guidelines/upload-url", { body: { filename: file.name } });
    if (!start.data) {
      setReadState("idle");
      return setReadError(msg(start.error));
    }
    try {
      await putToSignedUrl(start.data.upload_url, file, setProgress);
    } catch {
      setReadState("idle");
      return setReadError(t.errors.network);
    }
    setReadState("reading");
    const res = await api.POST("/admin/guidelines/extract", { body: { path: start.data.path } });
    if (!res.data) {
      setReadState("idle");
      return setReadError(msg(res.error));
    }
    const result = res.data;
    setExtraction(result);
    setReadState("done");
    setValues((cur) => ({
      ...rulesToForm({ name: cur.name, campus: cur.campus, citation: cur.citation }, result.rules),
      sections:
        result.suggested_sections.length >= 3
          ? result.suggested_sections.join("\n")
          : cur.sections || rulesToForm({}, result.rules).sections,
    }));
    toast.success(t.guidelines.readDone(result.findings.length));
  }

  async function save(status: "draft" | "published") {
    const found = validateForm(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      setFormError(t.guidelines.fixErrors);
      return;
    }
    setSaving(status);
    const body = {
      name: values.name.trim(),
      campus_name: values.campus.trim() || null,
      citation_style: values.citation,
      status,
      rules: formToRules(values),
    } satisfies GuidelineIn;
    const res = initial
      ? await api.PUT("/admin/guidelines/{guideline_id}", {
          params: { path: { guideline_id: initial.id } },
          body,
        })
      : await api.POST("/admin/guidelines", { body });
    setSaving(null);
    if (!res.data) return setFormError(msg(res.error));
    toast.success(status === "published" ? t.guidelines.published : t.guidelines.savedDraft);
    router.replace("/admin/pedoman");
  }

  const versioned = initial && initial.status !== "draft";

  return (
    <form
      className="flex flex-col gap-8"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save("draft");
      }}
    >
      {versioned && <Alert tone="info">{t.guidelines.newVersionNote(initial.version)}</Alert>}

      {!initial && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:gap-8">
          <div>
            <h2 className="flex items-center gap-2 text-[18px] font-semibold leading-7 text-ink-900">
              <Icon name="cloudUpload" className="text-primary-600" /> {t.guidelines.readTitle}
            </h2>
            <p className="mt-1 text-[14px] leading-5 text-ink-500">{t.guidelines.readBody}</p>
          </div>
          <Card className="flex flex-col gap-4">
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx,application/pdf"
              className="sr-only"
              aria-label={t.guidelines.chooseFile}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void readFile(f);
              }}
            />
            {readState === "idle" || readState === "done" ? (
              <div className="flex flex-col items-start gap-3 rounded-lg border-2 border-dashed border-primary-200 bg-primary-50/50 p-5 sm:flex-row sm:items-center">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-surface text-[22px] text-primary-600 shadow-sm">
                  <Icon name={readState === "done" ? "fileCheck" : "book"} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink-900">
                    {readState === "done" ? fileName : t.guidelines.dropTitle}
                  </p>
                  <p className="text-[13px] text-ink-500">
                    {readState === "done"
                      ? t.guidelines.readSummary(extraction?.findings.length ?? 0)
                      : t.guidelines.dropHint}
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                  <Icon name="upload" />{" "}
                  {readState === "done" ? t.guidelines.replaceFile : t.guidelines.chooseFile}
                </Button>
              </div>
            ) : (
              <div role="status" className="flex flex-col gap-3 rounded-lg bg-primary-50/50 p-5">
                <p className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
                  <Icon name="spinner" spin />{" "}
                  {readState === "uploading" ? t.guidelines.uploading : t.guidelines.reading}
                </p>
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2 overflow-hidden rounded-full bg-ink-100"
                >
                  <div
                    className="h-full rounded-full bg-primary-500 transition-[width]"
                    style={{
                      width: readState === "uploading" ? `${Math.round(progress * 100)}%` : "100%",
                    }}
                  />
                </div>
                <p className="truncate text-[13px] text-ink-500">{fileName}</p>
              </div>
            )}
            {readError && <Alert tone="error">{readError}</Alert>}
            {readState === "done" && extraction && (
              <Alert tone={extraction.findings.length === 0 ? "warning" : "info"}>
                {extraction.findings.length === 0
                  ? t.guidelines.nothingFound
                  : t.guidelines.reviewNote}
              </Alert>
            )}
          </Card>
        </section>
      )}

      <FormSection
        title={t.guidelines.identity}
        description={t.guidelines.identityBody}
        icon="thesis"
      >
        <div className="sm:col-span-2">
          <Field label={t.guidelines.name} htmlFor="g-name" error={errors.name}>
            <Input
              id="g-name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={t.guidelines.namePlaceholder}
              maxLength={200}
              invalid={Boolean(errors.name)}
            />
          </Field>
        </div>
        <Field label={t.guidelines.campus} htmlFor="g-campus" hint={t.common.optional}>
          <Input
            id="g-campus"
            value={values.campus}
            onChange={(e) => set("campus", e.target.value)}
            maxLength={200}
          />
        </Field>
        <Field label={t.guidelines.citation} htmlFor="g-citation" hint={hint("citation")}>
          <Select
            id="g-citation"
            value={values.citation}
            onChange={(e) => set("citation", e.target.value)}
          >
            {CITATION_STYLES.map((s) => (
              <option key={s} value={s}>
                {s.toUpperCase()}
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>

      <FormSection title={t.guidelines.page} description={t.guidelines.pageBody} icon="layers">
        {(
          [
            ["left", "Margin kiri (cm)"],
            ["top", "Margin atas (cm)"],
            ["right", "Margin kanan (cm)"],
            ["bottom", "Margin bawah (cm)"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label} htmlFor={`g-${key}`} error={errors[key]} hint={hint(key)}>
            <Input
              id={`g-${key}`}
              inputMode="decimal"
              value={values[key]}
              onChange={(e) => set(key, e.target.value)}
              invalid={Boolean(errors[key])}
            />
          </Field>
        ))}
        <Field label="Ukuran kertas" htmlFor="g-paper" hint={hint("paper")}>
          <Input
            id="g-paper"
            value={values.paper}
            onChange={(e) => set("paper", e.target.value)}
            maxLength={20}
          />
        </Field>
        <Field label="Toleransi margin (cm)" htmlFor="g-tolerance" error={errors.tolerance}>
          <Input
            id="g-tolerance"
            inputMode="decimal"
            value={values.tolerance}
            onChange={(e) => set("tolerance", e.target.value)}
            invalid={Boolean(errors.tolerance)}
          />
        </Field>
      </FormSection>

      <FormSection title={t.guidelines.body} description={t.guidelines.bodyBody} icon="format">
        <Field label="Jenis huruf" htmlFor="g-font" hint={hint("font")}>
          <Input
            id="g-font"
            value={values.font}
            onChange={(e) => set("font", e.target.value)}
            maxLength={60}
          />
        </Field>
        <Field label="Ukuran huruf (pt)" htmlFor="g-size" error={errors.size} hint={hint("size")}>
          <Input
            id="g-size"
            inputMode="decimal"
            value={values.size}
            onChange={(e) => set("size", e.target.value)}
            invalid={Boolean(errors.size)}
          />
        </Field>
        <Field
          label="Spasi baris"
          htmlFor="g-spacing"
          error={errors.spacing}
          hint={hint("spacing") ?? t.guidelines.spacingHint}
        >
          <Input
            id="g-spacing"
            value={values.spacing}
            onChange={(e) => set("spacing", e.target.value)}
            invalid={Boolean(errors.spacing)}
          />
        </Field>
        <Field
          label="Indentasi baris pertama (cm)"
          htmlFor="g-indent"
          error={errors.indent}
          hint={hint("indent")}
        >
          <Input
            id="g-indent"
            inputMode="decimal"
            value={values.indent}
            onChange={(e) => set("indent", e.target.value)}
            invalid={Boolean(errors.indent)}
          />
        </Field>
        <Field label="Perataan teks" htmlFor="g-align" hint={hint("align")}>
          <Select id="g-align" value={values.align} onChange={(e) => set("align", e.target.value)}>
            <option value="justify">Rata kiri-kanan</option>
            <option value="left">Rata kiri</option>
            <option value="center">Rata tengah</option>
            <option value="right">Rata kanan</option>
          </Select>
        </Field>
      </FormSection>

      <FormSection
        title={t.guidelines.structure}
        description={t.guidelines.structureBody}
        icon="structure"
      >
        <div className="sm:col-span-2">
          <Field
            label="Bagian wajib (satu per baris)"
            htmlFor="g-sections"
            hint={t.guidelines.sectionsHint}
          >
            <Textarea
              id="g-sections"
              rows={8}
              value={values.sections}
              onChange={(e) => set("sections", e.target.value)}
              spellCheck={false}
            />
          </Field>
        </div>
        <Field
          label="Abstrak minimal (kata)"
          htmlFor="g-absmin"
          error={errors.absMin}
          hint={hint("absMin")}
        >
          <Input
            id="g-absmin"
            inputMode="numeric"
            value={values.absMin}
            onChange={(e) => set("absMin", e.target.value)}
            invalid={Boolean(errors.absMin)}
          />
        </Field>
        <Field
          label="Abstrak maksimal (kata)"
          htmlFor="g-absmax"
          error={errors.absMax}
          hint={hint("absMax")}
        >
          <Input
            id="g-absmax"
            inputMode="numeric"
            value={values.absMax}
            onChange={(e) => set("absMax", e.target.value)}
            invalid={Boolean(errors.absMax)}
          />
        </Field>
        <Field label="Judul tabel" htmlFor="g-table" hint={hint("tablePos")}>
          <Select
            id="g-table"
            value={values.tablePos}
            onChange={(e) => set("tablePos", e.target.value)}
          >
            <option value="above">Di atas tabel</option>
            <option value="below">Di bawah tabel</option>
          </Select>
        </Field>
        <Field label="Judul gambar" htmlFor="g-figure" hint={hint("figurePos")}>
          <Select
            id="g-figure"
            value={values.figurePos}
            onChange={(e) => set("figurePos", e.target.value)}
          >
            <option value="above">Di atas gambar</option>
            <option value="below">Di bawah gambar</option>
          </Select>
        </Field>
        <Field
          label="Usia sumber maksimal (tahun)"
          htmlFor="g-age"
          error={errors.maxAge}
          hint={hint("maxAge")}
        >
          <Input
            id="g-age"
            inputMode="numeric"
            value={values.maxAge}
            onChange={(e) => set("maxAge", e.target.value)}
            invalid={Boolean(errors.maxAge)}
          />
        </Field>
      </FormSection>

      <FormSection
        title={t.guidelines.tester.title}
        description={t.guidelines.tester.description}
        icon="play"
      >
        <GuidelineTester getRules={() => formToRules(values)} />
      </FormSection>

      {formError && <Alert tone="error">{formError}</Alert>}
      <FormActions>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/admin/pedoman")}
          disabled={saving !== null}
        >
          {t.common.cancel}
        </Button>
        <Button
          type="submit"
          variant="outline"
          loading={saving === "draft"}
          disabled={saving === "published"}
        >
          {t.guidelines.saveDraft}
        </Button>
        <Button
          type="button"
          loading={saving === "published"}
          disabled={saving === "draft"}
          onClick={() => void save("published")}
        >
          <Icon name="done" /> {t.guidelines.publish}
        </Button>
      </FormActions>
    </form>
  );
}
