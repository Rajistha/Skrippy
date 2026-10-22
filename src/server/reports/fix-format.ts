/**
 * Perbaikan format otomatis pada XML dokumen: jenis huruf, ukuran huruf, spasi baris, dan margin.
 * Murni: string masuk, string keluar. Urutan elemen mengikuti skema OOXML agar Word tidak menolak berkas.
 */

const TWIPS_PER_CM = 567;

/** Elemen w:rPr yang harus berada SESUDAH w:sz/w:szCs menurut skema. */
const AFTER_SZ =
  /<w:(?:highlight|u|effect|bdr|shd|fitText|vertAlign|rtl|cs|em|lang|eastAsianLayout|specVanish|oMath)[\s/>]/;
/** Elemen w:pPr yang harus berada SESUDAH w:spacing menurut skema. */
const AFTER_SPACING =
  /<w:(?:ind|contextualSpacing|mirrorIndents|suppressOverlap|jc|textDirection|textAlignment|textboxTightWrap|outlineLvl|divId|cnfStyle|rPr|sectPr|pPrChange)[\s/>]/;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export type ParagraphFix = { font: boolean; size: boolean; spacing: boolean };

const RUN = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;

/** Isi w:rPr dari sebuah run (tanpa pembungkus), atau null bila belum ada. */
function splitRun(run: string): { open: string; rPr: string | null; rest: string } {
  const open = /^<w:r(?:\s[^>]*)?>/.exec(run)![0];
  const after = run.slice(open.length);
  const self = /^\s*<w:rPr\s*\/>/.exec(after);
  if (self) return { open, rPr: "", rest: after.slice(self[0].length) };
  const m = /^\s*<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(after);
  if (m) return { open, rPr: m[1]!, rest: after.slice(m[0].length) };
  return { open, rPr: null, rest: after };
}

function setFontOnProps(props: string, font: string): string {
  const el = `<w:rFonts w:ascii="${esc(font)}" w:hAnsi="${esc(font)}" w:eastAsia="${esc(font)}" w:cs="${esc(font)}"/>`;
  const stripped = props.replace(/<w:rFonts\b[^>]*\/>/g, "");
  const style = /^\s*<w:rStyle\b[^>]*\/>/.exec(stripped);
  if (style) return style[0] + el + stripped.slice(style[0].length);
  return el + stripped;
}

function setSizeOnProps(props: string, sizePt: number): string {
  const half = Math.round(sizePt * 2);
  const el = `<w:sz w:val="${half}"/><w:szCs w:val="${half}"/>`;
  const stripped = props.replace(/<w:(?:sz|szCs)\b[^>]*\/>/g, "");
  const at = stripped.search(AFTER_SZ);
  return at === -1 ? stripped + el : stripped.slice(0, at) + el + stripped.slice(at);
}

/** Terapkan huruf dan/atau ukuran pada semua run bertulisan di isi satu paragraf. */
function fixRuns(inner: string, fix: ParagraphFix, want: { font: string; sizePt: number }): string {
  return inner.replace(RUN, (run) => {
    if (!/<w:t[\s>]/.test(run)) return run;
    const { open, rPr, rest } = splitRun(run);
    let props = rPr ?? "";
    if (fix.font) props = setFontOnProps(props, want.font);
    if (fix.size) props = setSizeOnProps(props, want.sizePt);
    return `${open}<w:rPr>${props}</w:rPr>${rest}`;
  });
}

/** Spasi baris kelipatan (mis. 1,5 menjadi line=360), memakai w:spacing yang ada bila sudah ada. */
function fixSpacing(inner: string, line: number): string {
  const value = Math.round(line * 240);
  const pPr = /^\s*<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(inner);
  const spacingAttrs = `w:line="${value}" w:lineRule="auto"`;
  if (!pPr) return `<w:pPr><w:spacing ${spacingAttrs}/></w:pPr>${inner}`;
  const props = pPr[1]!;
  const existing = /<w:spacing\b([^>]*?)\/>/.exec(props);
  let next: string;
  if (existing) {
    const attrs = existing[1]!.replace(/\sw:line="[^"]*"/, "").replace(/\sw:lineRule="[^"]*"/, "");
    next = props.replace(existing[0], `<w:spacing${attrs} ${spacingAttrs}/>`);
  } else {
    const el = `<w:spacing ${spacingAttrs}/>`;
    const at = props.search(AFTER_SPACING);
    next = at === -1 ? props + el : props.slice(0, at) + el + props.slice(at);
  }
  return `<w:pPr>${next}</w:pPr>${inner.slice(pPr[0].length)}`;
}

export function fixParagraphInner(
  inner: string,
  fix: ParagraphFix,
  want: { font: string; sizePt: number; lineSpacing: number },
): string {
  let out = inner;
  if (fix.spacing) out = fixSpacing(out, want.lineSpacing);
  if (fix.font || fix.size) out = fixRuns(out, fix, want);
  return out;
}

export type Margins = { left: number; top: number; right: number; bottom: number };

/** Samakan semua w:pgMar dengan margin pedoman (cm). Mengembalikan XML baru dan jumlah bagian yang diubah. */
export function fixMargins(xml: string, want: Margins): { xml: string; changed: number } {
  let changed = 0;
  const target: Record<string, number> = {
    left: Math.round(want.left * TWIPS_PER_CM),
    top: Math.round(want.top * TWIPS_PER_CM),
    right: Math.round(want.right * TWIPS_PER_CM),
    bottom: Math.round(want.bottom * TWIPS_PER_CM),
  };
  const out = xml.replace(/<w:pgMar\b([^>]*?)\/>/g, (whole, attrs: string) => {
    let touched = false;
    const next = attrs.replace(
      /\sw:(left|top|right|bottom)="(-?\d+)"/g,
      (_m, side: string, v: string) => {
        const want = target[side]!;
        if (Math.abs(Number(v) - want) <= 28) return _m; // toleransi 0,05 cm
        touched = true;
        return ` w:${side}="${want}"`;
      },
    );
    if (!touched) return whole;
    changed++;
    return `<w:pgMar${next}/>`;
  });
  return { xml: out, changed };
}
