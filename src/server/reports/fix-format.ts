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

/** Elemen w:pPr yang harus berada SESUDAH w:ind menurut skema. */
const AFTER_IND =
  /<w:(?:contextualSpacing|mirrorIndents|suppressOverlap|jc|textDirection|textAlignment|textboxTightWrap|outlineLvl|divId|cnfStyle|rPr|sectPr|pPrChange)[\s/>]/;
/** Elemen w:pPr yang harus berada SESUDAH w:jc menurut skema. */
const AFTER_JC =
  /<w:(?:textDirection|textAlignment|textboxTightWrap|outlineLvl|divId|cnfStyle|rPr|sectPr|pPrChange)[\s/>]/;
/** Elemen w:rPr yang harus berada SESUDAH w:i/w:iCs menurut skema. */
const AFTER_ITALIC =
  /<w:(?:caps|smallCaps|strike|dstrike|outline|shadow|emboss|imprint|noProof|snapToGrid|vanish|webHidden|color|spacing|w|kern|position|sz|szCs|highlight|u|effect|bdr|shd|fitText|vertAlign|rtl|cs|em|lang|eastAsianLayout|specVanish|oMath)[\s/>]/;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export type ParagraphFix = {
  font: boolean;
  size: boolean;
  spacing: boolean;
  indent: boolean;
  align: boolean;
  /** Ada istilah asing di paragraf ini yang belum dicetak miring. */
  italic: boolean;
};

export type Alignment = "left" | "center" | "right" | "justify";
const JC: Record<Alignment, string> = {
  left: "left",
  center: "center",
  right: "right",
  justify: "both",
};

/** Isi w:pPr di awal isi paragraf (tanpa pembungkus), atau null bila belum ada. */
const PPR = /^\s*<w:pPr>([\s\S]*?)<\/w:pPr>/;

/** Indentasi baris pertama. Paragraf berdaftar (w:numPr) dibiarkan karena indentasinya milik daftar. */
function fixIndent(inner: string, cm: number): string {
  const value = Math.round(cm * TWIPS_PER_CM);
  const pPr = PPR.exec(inner);
  if (!pPr) return `<w:pPr><w:ind w:firstLine="${value}"/></w:pPr>${inner}`;
  const props = pPr[1]!;
  if (/<w:numPr[\s/>]/.test(props)) return inner;
  const existing = /<w:ind\b([^>]*?)\/>/.exec(props);
  let next: string;
  if (existing) {
    // firstLineChars menimpa firstLine, dan hanging bertentangan dengannya: buang ketiganya.
    const attrs = existing[1]!.replace(
      /\sw:(?:firstLine|firstLineChars|hanging|hangingChars)="[^"]*"/g,
      "",
    );
    next = props.replace(existing[0], `<w:ind${attrs} w:firstLine="${value}"/>`);
  } else {
    const el = `<w:ind w:firstLine="${value}"/>`;
    const at = props.search(AFTER_IND);
    next = at === -1 ? props + el : props.slice(0, at) + el + props.slice(at);
  }
  return `<w:pPr>${next}</w:pPr>${inner.slice(pPr[0].length)}`;
}

function fixAlignment(inner: string, align: Alignment): string {
  const el = `<w:jc w:val="${JC[align]}"/>`;
  const pPr = PPR.exec(inner);
  if (!pPr) return `<w:pPr>${el}</w:pPr>${inner}`;
  const props = pPr[1]!;
  const existing = /<w:jc\b[^>]*\/>/.exec(props);
  let next: string;
  if (existing) next = props.replace(existing[0], el);
  else {
    const at = props.search(AFTER_JC);
    next = at === -1 ? props + el : props.slice(0, at) + el + props.slice(at);
  }
  return `<w:pPr>${next}</w:pPr>${inner.slice(pPr[0].length)}`;
}

const ALREADY_ITALIC = /<w:i(?:\s+w:val="(?:1|true|on)")?\s*\/>/;

function italicProps(props: string): string {
  const stripped = props.replace(/<w:(?:i|iCs)\b[^>]*\/>/g, "");
  const el = "<w:i/><w:iCs/>";
  const at = stripped.search(AFTER_ITALIC);
  return at === -1 ? stripped + el : stripped.slice(0, at) + el + stripped.slice(at);
}

const SINGLE_TEXT_RUN =
  /^(<w:r(?:\s[^>]*)?>)(\s*<w:rPr\s*\/>|\s*<w:rPr>[\s\S]*?<\/w:rPr>)?\s*<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>\s*<\/w:r>$/;

/**
 * Cetak miring istilah asing. Hanya run berisi satu w:t yang dipecah (sebelum, istilah, sesudah);
 * istilah yang terbelah antar-run atau run berisi tab dan sejenisnya dibiarkan.
 */
function italicizeTerms(inner: string, terms: RegExp): string {
  return inner.replace(RUN, (run) => {
    const m = SINGLE_TEXT_RUN.exec(run);
    if (!m) return run;
    const open = m[1]!;
    const rPrFull = m[2];
    const text = m[3]!;
    const props = rPrFull ? (/<w:rPr>([\s\S]*)<\/w:rPr>/.exec(rPrFull)?.[1] ?? "") : "";
    if (ALREADY_ITALIC.test(props)) return run;
    const re = new RegExp(
      terms.source,
      terms.flags.includes("g") ? terms.flags : `${terms.flags}g`,
    );
    const pieces: { text: string; italic: boolean }[] = [];
    let last = 0;
    for (const hit of text.matchAll(re)) {
      if (hit.index > last) pieces.push({ text: text.slice(last, hit.index), italic: false });
      pieces.push({ text: hit[0], italic: true });
      last = hit.index + hit[0].length;
    }
    if (pieces.length === 0) return run;
    if (last < text.length) pieces.push({ text: text.slice(last), italic: false });
    const plainProps = rPrFull ? `<w:rPr>${props}</w:rPr>` : "";
    return pieces
      .map(
        (pc) =>
          `${open}${pc.italic ? `<w:rPr>${italicProps(props)}</w:rPr>` : plainProps}<w:t xml:space="preserve">${pc.text}</w:t></w:r>`,
      )
      .join("");
  });
}

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
  want: {
    font: string;
    sizePt: number;
    lineSpacing: number;
    indentCm: number;
    align: Alignment;
    foreignTerms: RegExp;
  },
): string {
  let out = inner;
  if (fix.spacing) out = fixSpacing(out, want.lineSpacing);
  if (fix.indent) out = fixIndent(out, want.indentCm);
  if (fix.align) out = fixAlignment(out, want.align);
  if (fix.font || fix.size) out = fixRuns(out, fix, want);
  if (fix.italic) out = italicizeTerms(out, want.foreignTerms);
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

const attrNum = (attrs: string, name: string): number | null => {
  const m = new RegExp(`\\sw:${name}="(-?\\d+)"`).exec(attrs);
  return m ? Number(m[1]) : null;
};

/** Lebar area teks (twips) dari w:sectPr pertama sesudah posisi `from`, yaitu section tempat tabel berada. */
function textWidthAfter(xml: string, from: number): number | null {
  const re = /<w:sectPr\b[\s\S]*?<\/w:sectPr>/g;
  re.lastIndex = from;
  const sect = re.exec(xml);
  if (!sect) return null;
  const sz = /<w:pgSz\b([^>]*?)\/>/.exec(sect[0]);
  const mar = /<w:pgMar\b([^>]*?)\/>/.exec(sect[0]);
  const page = sz ? attrNum(sz[1]!, "w") : null;
  const left = mar ? attrNum(mar[1]!, "left") : null;
  const right = mar ? attrNum(mar[1]!, "right") : null;
  if (page === null || left === null || right === null) return null;
  return page - left - right;
}

/** Skala lebar w:w pada elemen berjenis dxa; lebar persen atau otomatis dibiarkan. */
const scaleDxa = (xml: string, tag: string, factor: number): string =>
  xml.replace(new RegExp(`<w:${tag}\\b([^>]*?)\\/>`, "g"), (whole, attrs: string) => {
    if (tag !== "gridCol" && !/\sw:type="dxa"/.test(attrs)) return whole;
    return whole.replace(
      /(\sw:w=")(\d+)(")/,
      (_m, a: string, v: string, b: string) => `${a}${Math.floor(Number(v) * factor)}${b}`,
    );
  });

/**
 * Perkecil tabel yang lebih lebar dari area teks (misalnya sesudah margin diperbesar) secara proporsional.
 * Tabel yang bersarang dibiarkan. Mengembalikan XML baru dan jumlah tabel yang diubah.
 */
export function fixTableWidths(xml: string, toleranceCm: number): { xml: string; changed: number } {
  const spans: { start: number; end: number; nested: boolean }[] = [];
  const tag = /<(\/?)w:tbl(?=[\s>])[^>]*>/g;
  let depth = 0;
  let start = 0;
  let nested = false;
  for (let m = tag.exec(xml); m; m = tag.exec(xml)) {
    if (m[1] !== "/") {
      if (depth === 0) {
        start = m.index;
        nested = false;
      } else nested = true;
      depth++;
    } else {
      depth--;
      if (depth === 0) spans.push({ start, end: m.index + m[0].length, nested });
    }
  }
  let out = xml;
  let changed = 0;
  // Dari belakang ke depan agar posisi tabel sebelumnya tidak bergeser.
  for (const span of spans.reverse()) {
    if (span.nested) continue;
    const table = out.slice(span.start, span.end);
    const total = [...table.matchAll(/<w:gridCol\b[^>]*?\sw:w="(\d+)"/g)].reduce(
      (sum, g) => sum + Number(g[1]),
      0,
    );
    const limit = textWidthAfter(out, span.end);
    if (total === 0 || limit === null || limit <= 0) continue;
    if (total <= limit + toleranceCm * TWIPS_PER_CM) continue;
    const factor = limit / total;
    let next = scaleDxa(table, "gridCol", factor);
    next = scaleDxa(next, "tblW", factor);
    next = scaleDxa(next, "tcW", factor);
    out = out.slice(0, span.start) + next + out.slice(span.end);
    changed++;
  }
  return { xml: out, changed };
}
