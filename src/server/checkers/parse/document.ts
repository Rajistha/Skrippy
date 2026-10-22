import type {
  BodyElement,
  ParsedDocument,
  ParsedParagraph,
  ParsedMeta,
  ParsedRun,
  ParsedSection,
  ParsedTable,
} from "../types";
import {
  StyleSheet,
  readParaProps,
  readRunProps,
  readTheme,
  twipsToCm,
  type ThemeFonts,
} from "./styles";
import { readDocxParts, type DocxParts } from "./zip";
import { attr, child, children, kids, parseXml, tagOf, type XNode } from "./xml";

const HEADING_STYLE = /^(heading|judul)\s*(\d+)$/i;
const CHAPTER = /^\s*BAB\s+[IVXLC]+\b/i;
const TOC_STYLE = /^(toc\b|daftar isi|table of contents|table of figures|daftar (gambar|tabel))/i;
const TOC_LEADER = /(\.{4,}|…{2,}|\t)\s*[\divxlc]+\s*$/i;

/** Elemen yang membungkus run dan perlu ditelusuri; w:del (teks terhapus) sengaja dilewati. */
const RUN_CONTAINERS = new Set([
  "w:hyperlink",
  "w:ins",
  "w:fldSimple",
  "w:smartTag",
  "w:sdt",
  "w:sdtContent",
  "w:customXml",
]);

type Counter = { pageBreaks: number; seenMarker: boolean; revisions: number };

/** Cari semua keturunan dengan tag tertentu. */
function descendants(node: XNode, tag: string, out: XNode[] = []): XNode[] {
  for (const k of kids(node)) {
    if (tagOf(k) === tag) out.push(k);
    descendants(k, tag, out);
  }
  return out;
}

const EMU_PER_CM = 360000;

function headingLevel(styleName: string, styleId: string | undefined): number | null {
  const m =
    HEADING_STYLE.exec(styleName.trim()) ??
    HEADING_STYLE.exec((styleId ?? "").replace(/([a-z])(\d)/i, "$1 $2"));
  return m ? Number(m[2]) : null;
}

type RunDraft = {
  run: ParsedRun;
  drawing: boolean;
  widthCm: number | null;
  altMissing: boolean;
};

function collectRuns(
  nodes: XNode[],
  ctx: {
    sheet: StyleSheet;
    paraStyleId: string | undefined;
    counter: Counter;
    firstPage: { value: number | null };
  },
  out: RunDraft[],
): void {
  for (const node of nodes) {
    const tag = tagOf(node);
    if (!tag) continue;
    if (tag === "w:del") {
      ctx.counter.revisions += 1;
      continue;
    }
    if (tag === "w:r") {
      const rPr = child(node, "w:rPr");
      const charStyle = attr(child(rPr, "w:rStyle") ?? {}, "w:val");
      const direct = readRunProps(rPr, ctx.sheet.theme);
      const eff = ctx.sheet.effectiveRun(ctx.paraStyleId, charStyle, direct);
      let text = "";
      let drawing = false;
      let widthCm: number | null = null;
      let altMissing = false;
      for (const part of kids(node)) {
        const pt = tagOf(part);
        if (pt === "w:lastRenderedPageBreak") {
          ctx.counter.pageBreaks += 1;
          ctx.counter.seenMarker = true;
        } else if (pt === "w:t") {
          for (const k of kids(part))
            if (typeof k["#text"] === "string") text += k["#text"] as string;
        } else if (pt === "w:tab") text += "\t";
        else if (pt === "w:br" || pt === "w:cr") text += " ";
        else if (pt === "w:noBreakHyphen") text += "-";
        else if (pt === "w:drawing" || pt === "w:pict" || pt === "w:object") {
          drawing = true;
          for (const pr of descendants(part, "wp:docPr")) {
            if (!(attr(pr, "descr") ?? "").trim() && !(attr(pr, "title") ?? "").trim())
              altMissing = true;
          }
          for (const ext of descendants(part, "wp:extent")) {
            const cx = Number(attr(ext, "cx"));
            if (Number.isFinite(cx) && cx > 0) widthCm = Math.max(widthCm ?? 0, cx / EMU_PER_CM);
          }
        }
      }
      if ((text !== "" || drawing) && ctx.firstPage.value === null) {
        ctx.firstPage.value = ctx.counter.pageBreaks + 1;
      }
      out.push({
        run: {
          text,
          italic: eff.italic === true,
          bold: eff.bold === true,
          fontName: eff.font ?? null,
          fontSizePt: eff.sizePt ?? null,
        },
        drawing,
        widthCm,
        altMissing,
      });
    } else if (RUN_CONTAINERS.has(tag)) {
      if (tag === "w:ins") ctx.counter.revisions += 1;
      collectRuns(kids(node), ctx, out);
    }
  }
}

function parseSectPr(
  sectPr: XNode | undefined,
  index: number,
  rels: Map<string, string>,
  footers: Map<string, string>,
  inheritedField: boolean,
): ParsedSection {
  const pgSz = child(sectPr, "w:pgSz");
  const pgMar = child(sectPr, "w:pgMar");
  const pgNum = child(sectPr, "w:pgNumType");
  const num = (node: XNode | undefined, name: string): number => {
    const v = node ? Number(attr(node, name)) : NaN;
    return Number.isFinite(v) ? twipsToCm(v) : 0;
  };

  let hasField = inheritedField;
  const refs = children(sectPr, "w:footerReference");
  if (refs.length > 0) {
    hasField = refs.some((ref) => {
      const rid = attr(ref, "r:id");
      const target = rid ? rels.get(rid) : undefined;
      const xml = target ? footers.get(`word/${target.replace(/^\/?(word\/)?/, "")}`) : undefined;
      return xml ? /instrText[^>]*>[^<]*\bPAGE\b|fldSimple[^>]*\bPAGE\b/i.test(xml) : false;
    });
  }

  let hasHeaderText = false;
  for (const ref of children(sectPr, "w:headerReference")) {
    const rid = attr(ref, "r:id");
    const target = rid ? rels.get(rid) : undefined;
    const xml = target ? footers.get(`word/${target.replace(/^\/?(word\/)?/, "")}`) : undefined;
    if (xml && /<w:t[ >][^<]*[^<\s][^<]*<\/w:t>/.test(xml)) hasHeaderText = true;
  }

  const startRaw = pgNum ? Number(attr(pgNum, "w:start")) : NaN;
  return {
    index,
    pageWidthCm: num(pgSz, "w:w"),
    pageHeightCm: num(pgSz, "w:h"),
    marginLeftCm: num(pgMar, "w:left"),
    marginTopCm: num(pgMar, "w:top"),
    marginRightCm: num(pgMar, "w:right"),
    marginBottomCm: num(pgMar, "w:bottom"),
    pageNumberFormat: pgNum ? (attr(pgNum, "w:fmt") ?? null) : null,
    pageNumberStart: Number.isFinite(startRaw) ? startRaw : null,
    hasPageNumberField: hasField,
    hasHeaderText,
  };
}

function parseRels(xml: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!xml) return map;
  const root = parseXml(xml).find((n) => tagOf(n) === "Relationships");
  for (const rel of children(root, "Relationship")) {
    const id = attr(rel, "Id");
    const target = attr(rel, "Target");
    if (id && target) map.set(id, target);
  }
  return map;
}

/** Ratakan w:sdt (kontrol konten, sering membungkus daftar isi) ke urutan elemen body. */
function flattenBody(nodes: XNode[]): XNode[] {
  const out: XNode[] = [];
  for (const n of nodes) {
    const tag = tagOf(n);
    if (tag === "w:sdt") {
      out.push(...flattenBody(kids(child(n, "w:sdtContent") ?? {})));
    } else if (tag === "w:p" || tag === "w:tbl" || tag === "w:sectPr") {
      out.push(n);
    }
  }
  return out;
}

/** Huruf yang paling banyak dipakai (menurut jumlah karakter) di seluruh paragraf dalam tabel. */
function tableFont(
  node: XNode,
  sheet: StyleSheet,
): { fontName: string | null; fontSizePt: number | null } {
  const fonts = new Map<string, number>();
  const sizes = new Map<number, number>();
  for (const p of descendants(node, "w:p")) {
    const pPr = child(p, "w:pPr");
    const styleId = attr(child(pPr, "w:pStyle") ?? {}, "w:val");
    const drafts: RunDraft[] = [];
    collectRuns(
      kids(p),
      {
        sheet,
        paraStyleId: styleId,
        counter: { pageBreaks: 0, seenMarker: false, revisions: 0 },
        firstPage: { value: null },
      },
      drafts,
    );
    for (const { run } of drafts) {
      const n = run.text.trim().length;
      if (n === 0) continue;
      if (run.fontName) fonts.set(run.fontName, (fonts.get(run.fontName) ?? 0) + n);
      if (run.fontSizePt) sizes.set(run.fontSizePt, (sizes.get(run.fontSizePt) ?? 0) + n);
    }
  }
  const top = <K>(m: Map<K, number>): K | null =>
    [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { fontName: top(fonts), fontSizePt: top(sizes) };
}

function parseTable(node: XNode, elementIndex: number, sheet: StyleSheet): ParsedTable {
  const rows = children(node, "w:tr");
  const grid = children(child(node, "w:tblGrid"), "w:gridCol");
  const twips = grid.reduce((sum, g) => sum + (Number(attr(g, "w:w")) || 0), 0);
  const hasHeaderRow = rows.some((r) => child(child(r, "w:trPr"), "w:tblHeader") !== undefined);
  return {
    elementIndex,
    rows: rows.length,
    cols: grid.length,
    widthCm: twips > 0 ? twipsToCm(twips) : null,
    hasHeaderRow,
    ...tableFont(node, sheet),
  };
}

function parseMeta(xml: string | null): ParsedMeta | null {
  if (!xml) return null;
  const pick = (tag: string): string | null => {
    const m = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`).exec(xml);
    const v = m?.[1]?.trim();
    return v ? v : null;
  };
  return {
    title: pick("dc:title"),
    author: pick("dc:creator"),
    lastModifiedBy: pick("cp:lastModifiedBy"),
  };
}

const count = (xml: string | null, re: RegExp): number => (xml ? (xml.match(re) ?? []).length : 0);

export function parseParts(parts: DocxParts): ParsedDocument {
  const theme: ThemeFonts = readTheme(parts.theme);
  const sheet = new StyleSheet(parts.styles, theme);
  const rels = parseRels(parts.rels);

  const root = parseXml(parts.document).find((n) => tagOf(n) === "w:document");
  const body = child(root, "w:body");

  const paragraphs: ParsedParagraph[] = [];
  const elements: BodyElement[] = [];
  const sectPrs: XNode[] = [];
  const tables: ParsedTable[] = [];
  const counter: Counter = { pageBreaks: 0, seenMarker: false, revisions: 0 };
  let sectionIndex = 0;
  let tableCount = 0;
  let wordCount = 0;

  for (const node of flattenBody(kids(body ?? {}))) {
    const tag = tagOf(node);
    if (tag === "w:tbl") {
      tableCount += 1;
      tables.push(parseTable(node, elements.length, sheet));
      elements.push({ kind: "tbl" });
      continue;
    }
    if (tag === "w:sectPr") {
      sectPrs.push(node);
      continue;
    }

    const pPr = child(node, "w:pPr");
    const styleId = attr(child(pPr, "w:pStyle") ?? {}, "w:val");
    const styleName = sheet.styleName(styleId);
    const direct = readParaProps(pPr);
    const eff = sheet.effectivePara(styleId, direct);

    const drafts: RunDraft[] = [];
    const firstPage = { value: null as number | null };
    collectRuns(kids(node), { sheet, paraStyleId: styleId, counter, firstPage }, drafts);
    const runs = drafts.map((d) => d.run).filter((r) => r.text !== "");
    const text = drafts.map((d) => d.run.text).join("");

    const level = headingLevel(styleName, sheet.paragraphStyleId(styleId));
    const isToc =
      TOC_STYLE.test(styleName) || TOC_LEADER.test(text) || /^toc\d*$/i.test(styleId ?? "");
    const trimmed = text.trim();

    const index = paragraphs.length;
    paragraphs.push({
      index,
      text,
      styleName,
      sectionIndex,
      headingLevel: level,
      isChapterHeading: !isToc && CHAPTER.test(text) && trimmed.length < 80,
      isToc,
      alignment: eff.alignment ?? null,
      lineSpacing: eff.lineSpacing?.kind === "multiple" ? eff.lineSpacing.value : null,
      firstLineIndentCm: eff.firstLineCm ?? null,
      hasDrawing: drafts.some((d) => d.drawing),
      imageWidthCm: drafts.reduce<number | null>(
        (w, d) => (d.widthCm === null ? w : Math.max(w ?? 0, d.widthCm)),
        null,
      ),
      imageAltMissing: drafts.some((d) => d.drawing && d.altMissing),
      hasMath:
        descendants(node, "m:oMath").length > 0 || descendants(node, "m:oMathPara").length > 0,
      page: firstPage.value,
      runs,
    });
    elements.push({ kind: "p", index });
    wordCount += trimmed === "" ? 0 : trimmed.split(/\s+/).length;

    const paragraphSect = child(pPr, "w:sectPr");
    if (paragraphSect) {
      sectPrs.push(paragraphSect);
      sectionIndex += 1;
    }
  }

  // Tanpa penanda halaman dari Word, jangan menebak: semua page menjadi null.
  const hasPageMarkers = counter.seenMarker;
  const finalParagraphs = hasPageMarkers
    ? paragraphs
    : paragraphs.map((p) => ({ ...p, page: null }));

  const sections: ParsedSection[] = [];
  let inheritedField = false;
  sectPrs.forEach((sp, i) => {
    const section = parseSectPr(sp, i, rels, parts.headersFooters, inheritedField);
    sections.push(section);
    inheritedField = section.hasPageNumberField;
  });
  if (sections.length === 0) {
    sections.push(parseSectPr(undefined, 0, rels, parts.headersFooters, false));
  }

  const hasTocField =
    /<w:instrText[^>]*>[^<]*\bTOC\b|<w:fldSimple[^>]*w:instr="[^"]*\bTOC\b|<w:docPartGallery w:val="(Table of Contents|Daftar Isi)"/i.test(
      parts.document,
    );

  return {
    paragraphs: finalParagraphs,
    tables,
    revisions: counter.revisions,
    commentCount: count(parts.comments, /<w:comment\b/g),
    footnoteCount: count(parts.footnotes, /<w:footnote\b(?![^>]*w:type=)/g),
    hasTocField,
    meta: parseMeta(parts.core),
    sections,
    elements,
    tableCount,
    wordCount,
    hasPageMarkers,
  };
}

export function parseDocx(data: Uint8Array): ParsedDocument {
  return parseParts(readDocxParts(data));
}
