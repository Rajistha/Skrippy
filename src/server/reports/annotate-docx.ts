/**
 * Menyisipkan temuan sebagai komentar Word ke dalam salinan naskah (Fase 2). Murni: bytes masuk, bytes keluar.
 *
 * Nomor paragraf mengikuti parser (checkers/parse/document.ts): paragraf tingkat atas badan dokumen,
 * termasuk yang di dalam kontrol konten (w:sdt), tanpa paragraf di dalam tabel atau kotak teks.
 * File asli tidak diubah; hanya salinan yang diberi komentar.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

export type Severity = "critical" | "major" | "minor";
export type AnnotationComment = {
  paragraphIndex: number;
  text: string;
  /** Bila diisi, teks bermasalah diberi sorotan warna menurut keparahan. */
  severity?: Severity;
  /** Kutipan yang disorot; tanpa kutipan yang cocok, seluruh paragraf disorot. */
  excerpt?: string | null;
};

/** Warna sorotan (hex OOXML, bukan token UI): merah muda, kuning, biru muda. */
const FILL: Record<Severity, string> = { critical: "FDA29B", major: "FEDF89", minor: "B2CCFF" };
const FILLS = new Set(Object.values(FILL));
const RANK: Record<Severity, number> = { critical: 3, major: 2, minor: 1 };

const AUTHOR = "Skrippy";
const INITIALS = "SK";
const MAX_COMMENTS = 400;
const MAX_UNCOMPRESSED = 200 * 1024 * 1024;
const NS_COMMENTS_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
const COMMENTS_CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml";

const escapeXml = (s: string): string =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

type ParaSpan = { open: [number, number]; close: number | null; pPrEnd: number | null };

/** Posisi paragraf tingkat atas (di luar tabel dan kotak teks) dalam document.xml, berurutan. */
export function findTopLevelParagraphs(xml: string): ParaSpan[] {
  const spans: ParaSpan[] = [];
  const tag = /<(\/?)w:(tbl|p|txbxContent)(?=[\s/>])[^>]*?(\/?)>/g;
  let tblDepth = 0;
  let txDepth = 0;
  let pDepth = 0;
  let current: ParaSpan | null = null;
  for (let m = tag.exec(xml); m; m = tag.exec(xml)) {
    const closing = m[1] === "/";
    const selfClosing = m[3] === "/";
    const name = m[2]!;
    if (name === "tbl") tblDepth += closing ? -1 : selfClosing ? 0 : 1;
    else if (name === "txbxContent") txDepth += closing ? -1 : selfClosing ? 0 : 1;
    else if (!closing) {
      if (tblDepth === 0 && txDepth === 0 && pDepth === 0) {
        current = { open: [m.index, m.index + m[0].length], close: null, pPrEnd: null };
        if (selfClosing) spans.push(current);
        else {
          spans.push(current);
          pDepth = 1;
        }
      } else if (!selfClosing) pDepth += 1;
    } else if (pDepth > 0) {
      pDepth -= 1;
      if (pDepth === 0 && current) {
        current.close = m.index;
        // Komentar harus sesudah w:pPr bila ada (w:pPr wajib anak pertama paragraf).
        const inner = xml.slice(current.open[1], m.index);
        const pPr = /^\s*<w:pPr(?=[\s/>])[\s\S]*?<\/w:pPr>/.exec(inner);
        current.pPrEnd = pPr ? current.open[1] + pPr[0].length : null;
        current = null;
      }
    }
  }
  return spans;
}

const RUN = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
const LATER_THAN_SHD =
  /<w:(?:fitText|vertAlign|rtl|cs|em|lang|eastAsianLayout|specVanish|oMath)[\s/>]/;

const shdTag = (fill: string): string => `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`;
const hasOurFill = (run: string): boolean =>
  [...run.matchAll(/<w:shd\b[^>]*\bw:fill="([0-9A-Fa-f]{6})"/g)].some((m) =>
    FILLS.has(m[1]!.toUpperCase()),
  );

/** Beri latar warna pada satu run (w:r) yang memuat teks; run lain dibiarkan. */
function shadeRun(run: string, fill: string): string {
  if (!/<w:t[\s>]/.test(run) || hasOurFill(run)) return run;
  const open = /^<w:r(?:\s[^>]*)?>/.exec(run)![0];
  const rest = run.slice(open.length);
  const selfClosing = /^\s*<w:rPr\s*\/>/.exec(rest);
  if (selfClosing)
    return open + `<w:rPr>${shdTag(fill)}</w:rPr>` + rest.slice(selfClosing[0].length);
  const rPr = /^\s*<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(rest);
  if (!rPr) return open + `<w:rPr>${shdTag(fill)}</w:rPr>` + rest;
  const props = rPr[1]!.replace(/<w:shd\b[^>]*\/>/g, "");
  const at = props.search(LATER_THAN_SHD);
  const merged =
    at === -1 ? props + shdTag(fill) : props.slice(0, at) + shdTag(fill) + props.slice(at);
  return open + `<w:rPr>${merged}</w:rPr>` + rest.slice(rPr[0].length);
}

/** Pecah run yang hanya berisi satu teks menjadi sebelum/sorotan/sesudah. Null bila kutipan tidak ada di run itu. */
function splitRun(run: string, needle: string, fill: string): string | null {
  const open = /^<w:r(?:\s[^>]*)?>/.exec(run)![0];
  const rest = run.slice(open.length, run.length - "</w:r>".length);
  const rPr = /^\s*<w:rPr>[\s\S]*?<\/w:rPr>|^\s*<w:rPr\s*\/>/.exec(rest)?.[0] ?? "";
  const body = rest.slice(rPr.length);
  const t = /^<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>$/.exec(body);
  if (!t || hasOurFill(run)) return null;
  const text = t[1]!;
  const at = text.indexOf(needle);
  if (at < 0) return null;
  const make = (part: string): string =>
    part === "" ? "" : `${open}${rPr}<w:t xml:space="preserve">${part}</w:t></w:r>`;
  return (
    make(text.slice(0, at)) +
    shadeRun(make(text.slice(at, at + needle.length)), fill) +
    make(text.slice(at + needle.length))
  );
}

/** Sorot teks bermasalah dalam isi satu paragraf. Kutipan yang tidak ketemu menyorot seluruh paragraf. */
function highlightInner(
  inner: string,
  items: { severity: Severity; excerpt?: string | null }[],
): string {
  const pending = items
    .filter((i) => (i.excerpt ?? "").trim().length >= 3)
    .map((i) => ({
      severity: i.severity,
      needle: escapeXml(i.excerpt!.replace(/^[….\s]+|[….\s]+$/g, "")),
    }))
    .filter((i) => i.needle.length >= 3);
  const withoutExcerpt = items.filter((i) => (i.excerpt ?? "").trim().length < 3);
  const unmatched: Severity[] = withoutExcerpt.map((i) => i.severity);

  let out = inner.replace(RUN, (run) => {
    for (let k = 0; k < pending.length; k++) {
      const hit = splitRun(run, pending[k]!.needle, FILL[pending[k]!.severity]);
      if (hit) {
        pending.splice(k, 1);
        return hit;
      }
    }
    return run;
  });
  for (const p of pending) unmatched.push(p.severity);
  if (unmatched.length > 0) {
    const worst = unmatched.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
    out = out.replace(RUN, (run) => shadeRun(run, FILL[worst]));
  }
  return out;
}

function nextCommentId(commentsXml: string | null): number {
  if (!commentsXml) return 0;
  const ids = [...commentsXml.matchAll(/<w:comment\b[^>]*\bw:id="(\d+)"/g)].map((m) =>
    Number(m[1]),
  );
  return ids.length === 0 ? 0 : Math.max(...ids) + 1;
}

export function annotateDocx(
  data: Uint8Array,
  comments: AnnotationComment[],
  now: Date = new Date(),
  options: { comments?: boolean } = {},
): Uint8Array {
  let total = 0;
  unzipSync(data, {
    filter: (f) => {
      total += f.originalSize;
      return false;
    },
  });
  if (total > MAX_UNCOMPRESSED) throw new Error("docx_too_large");
  const files = unzipSync(data);
  const docBytes = files["word/document.xml"];
  if (!docBytes) throw new Error("docx_invalid");

  let xml = strFromU8(docBytes);
  let spans = findTopLevelParagraphs(xml);
  const usable = comments.filter((c) => {
    const s = spans[c.paragraphIndex];
    return s !== undefined && s.close !== null;
  });
  const chosen = usable.slice(0, MAX_COMMENTS);
  if (chosen.length === 0) return data;

  // Sorotan dulu (dari paragraf terakhir ke awal agar offset aman), lalu posisi paragraf dihitung ulang.
  const byParagraph = new Map<number, { severity: Severity; excerpt?: string | null }[]>();
  for (const c of chosen) {
    if (!c.severity) continue;
    byParagraph.set(c.paragraphIndex, [
      ...(byParagraph.get(c.paragraphIndex) ?? []),
      { severity: c.severity, excerpt: c.excerpt },
    ]);
  }
  for (const index of [...byParagraph.keys()].sort((a, b) => b - a)) {
    const span = spans[index]!;
    const from = span.open[1];
    const to = span.close!;
    xml =
      xml.slice(0, from) +
      highlightInner(xml.slice(from, to), byParagraph.get(index)!) +
      xml.slice(to);
    spans = findTopLevelParagraphs(xml);
  }

  if (options.comments === false) {
    files["word/document.xml"] = strToU8(xml);
    return repack(files);
  }

  const existing = files["word/comments.xml"] ? strFromU8(files["word/comments.xml"]) : null;
  let id = nextCommentId(existing);
  const date = now.toISOString().replace(/\.\d+Z$/, "Z");

  // Sisipan per paragraf: awal (rentang dimulai) dan akhir (rentang berakhir + penanda).
  const starts = new Map<number, string>();
  const ends = new Map<number, string>();
  const bodies: string[] = [];
  for (const c of chosen) {
    const cid = id++;
    const span = spans[c.paragraphIndex]!;
    const startAt = span.pPrEnd ?? span.open[1];
    starts.set(startAt, (starts.get(startAt) ?? "") + `<w:commentRangeStart w:id="${cid}"/>`);
    ends.set(
      span.close!,
      (ends.get(span.close!) ?? "") +
        `<w:commentRangeEnd w:id="${cid}"/><w:r><w:commentReference w:id="${cid}"/></w:r>`,
    );
    const paragraphs = c.text
      .split("\n")
      .map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`)
      .join("");
    bodies.push(
      `<w:comment w:id="${cid}" w:author="${AUTHOR}" w:date="${date}" w:initials="${INITIALS}">${paragraphs}</w:comment>`,
    );
  }

  // Terapkan sisipan dari posisi terjauh ke terdekat agar offset tidak bergeser.
  const inserts = [
    ...[...starts].map(([at, text]) => ({ at, text })),
    ...[...ends].map(([at, text]) => ({ at, text })),
  ].sort((a, b) => b.at - a.at);
  let out = xml;
  for (const ins of inserts) out = out.slice(0, ins.at) + ins.text + out.slice(ins.at);
  files["word/document.xml"] = strToU8(out);

  const commentsXml = existing
    ? existing.replace(/<\/w:comments>\s*$/, `${bodies.join("")}</w:comments>`)
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${bodies.join("")}</w:comments>`;
  files["word/comments.xml"] = strToU8(commentsXml);

  if (!existing) {
    const ctName = "[Content_Types].xml";
    const ct = files[ctName] ? strFromU8(files[ctName]!) : null;
    if (!ct) throw new Error("docx_invalid");
    if (!ct.includes('PartName="/word/comments.xml"')) {
      files[ctName] = strToU8(
        ct.replace(
          "</Types>",
          `<Override PartName="/word/comments.xml" ContentType="${COMMENTS_CT}"/></Types>`,
        ),
      );
    }
    const relName = "word/_rels/document.xml.rels";
    const rels = files[relName] ? strFromU8(files[relName]!) : null;
    if (!rels) throw new Error("docx_invalid");
    if (!rels.includes(NS_COMMENTS_TYPE)) {
      const ids = [...rels.matchAll(/\bId="rId(\d+)"/g)].map((m) => Number(m[1]));
      const rid = `rId${(ids.length ? Math.max(...ids) : 0) + 1}`;
      files[relName] = strToU8(
        rels.replace(
          "</Relationships>",
          `<Relationship Id="${rid}" Type="${NS_COMMENTS_TYPE}" Target="comments.xml"/></Relationships>`,
        ),
      );
    }
  }

  return repack(files);
}

/** Media sudah terkompresi: simpan tanpa kompresi ulang. */
function repack(files: Record<string, Uint8Array>): Uint8Array {
  const zippable: Zippable = {};
  for (const [name, bytes] of Object.entries(files)) {
    zippable[name] = /^word\/media\//.test(name) ? [bytes, { level: 0 }] : [bytes, { level: 6 }];
  }
  return zipSync(zippable);
}
