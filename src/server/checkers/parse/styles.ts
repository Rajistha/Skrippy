import type { Alignment } from "../types";
import { attr, child, children, type XNode, kids, parseXml, tagOf } from "./xml";

const TWIPS_PER_CM = 1440 / 2.54;

export function twipsToCm(twips: number): number {
  return Math.round((twips / TWIPS_PER_CM) * 100) / 100;
}

/** Spasi baris: kelipatan, atau tetap (pt) yang tidak bisa dibandingkan dengan kelipatan. */
export type LineSpacing = { kind: "multiple"; value: number } | { kind: "fixed" };

export type ParaProps = {
  alignment?: Alignment;
  lineSpacing?: LineSpacing;
  firstLineCm?: number;
};

export type RunProps = {
  font?: string;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
};

export type StyleDef = {
  id: string;
  name: string;
  type: string;
  basedOn?: string;
  isDefault: boolean;
  para: ParaProps;
  run: RunProps;
};

export type ThemeFonts = { major?: string; minor?: string };

const JC: Record<string, Alignment> = {
  left: "left",
  start: "left",
  center: "center",
  right: "right",
  end: "right",
  both: "justify",
  distribute: "justify",
  justify: "justify",
};

/** w:b / w:i: elemen ada tanpa val berarti aktif; val 0/false/off berarti mati. */
function toggle(node: XNode | undefined): boolean | undefined {
  if (!node) return undefined;
  const v = attr(node, "w:val");
  if (v === undefined) return true;
  return !["0", "false", "off"].includes(v.toLowerCase());
}

export function readRunProps(rPr: XNode | undefined, theme: ThemeFonts): RunProps {
  if (!rPr) return {};
  const out: RunProps = {};
  const fonts = child(rPr, "w:rFonts");
  if (fonts) {
    const explicit = attr(fonts, "w:ascii") ?? attr(fonts, "w:hAnsi") ?? attr(fonts, "w:cs");
    const themed = attr(fonts, "w:asciiTheme") ?? attr(fonts, "w:hAnsiTheme");
    if (explicit) out.font = explicit;
    else if (themed) {
      const resolved = themed.startsWith("major") ? theme.major : theme.minor;
      if (resolved) out.font = resolved;
    }
  }
  const sz = child(rPr, "w:sz");
  const szVal = sz ? Number(attr(sz, "w:val")) : NaN;
  if (Number.isFinite(szVal)) out.sizePt = szVal / 2;
  const bold = toggle(child(rPr, "w:b"));
  if (bold !== undefined) out.bold = bold;
  const italic = toggle(child(rPr, "w:i"));
  if (italic !== undefined) out.italic = italic;
  return out;
}

export function readParaProps(pPr: XNode | undefined): ParaProps {
  if (!pPr) return {};
  const out: ParaProps = {};
  const jc = child(pPr, "w:jc");
  const jcVal = jc ? attr(jc, "w:val") : undefined;
  if (jcVal && JC[jcVal]) out.alignment = JC[jcVal];

  const spacing = child(pPr, "w:spacing");
  const line = spacing ? Number(attr(spacing, "w:line")) : NaN;
  if (spacing && Number.isFinite(line)) {
    const rule = attr(spacing, "w:lineRule") ?? "auto";
    out.lineSpacing =
      rule === "auto"
        ? { kind: "multiple", value: Math.round((line / 240) * 100) / 100 }
        : { kind: "fixed" };
  }

  const ind = child(pPr, "w:ind");
  if (ind) {
    const first = Number(attr(ind, "w:firstLine"));
    const hanging = Number(attr(ind, "w:hanging"));
    if (Number.isFinite(first)) out.firstLineCm = twipsToCm(first);
    else if (Number.isFinite(hanging)) out.firstLineCm = -twipsToCm(hanging);
  }
  return out;
}

export function readTheme(xml: string | null): ThemeFonts {
  if (!xml) return {};
  const root = parseXml(xml);
  const find = (nodes: XNode[], tag: string): XNode | undefined => {
    for (const n of nodes) {
      if (tagOf(n) === tag) return n;
      const nested = find(kids(n), tag);
      if (nested) return nested;
    }
    return undefined;
  };
  const latin = (fontTag: string): string | undefined => {
    const font = find(root, fontTag);
    const l = font ? child(font, "a:latin") : undefined;
    const face = l ? attr(l, "typeface") : undefined;
    return face || undefined;
  };
  return { major: latin("a:majorFont"), minor: latin("a:minorFont") };
}

export class StyleSheet {
  private readonly styles = new Map<string, StyleDef>();
  private defaultParagraphStyleId: string | undefined;
  readonly defaultsPara: ParaProps;
  readonly defaultsRun: RunProps;

  constructor(
    xml: string | null,
    readonly theme: ThemeFonts,
  ) {
    if (!xml) {
      this.defaultsPara = {};
      this.defaultsRun = {};
      return;
    }
    const root = parseXml(xml).find((n) => tagOf(n) === "w:styles");
    const docDefaults = child(root, "w:docDefaults");
    this.defaultsRun = readRunProps(child(child(docDefaults, "w:rPrDefault"), "w:rPr"), theme);
    this.defaultsPara = readParaProps(child(child(docDefaults, "w:pPrDefault"), "w:pPr"));

    for (const s of children(root, "w:style")) {
      const id = attr(s, "w:styleId");
      if (!id) continue;
      const def: StyleDef = {
        id,
        name: attr(child(s, "w:name") ?? {}, "w:val") ?? id,
        type: attr(s, "w:type") ?? "paragraph",
        basedOn: attr(child(s, "w:basedOn") ?? {}, "w:val"),
        isDefault: attr(s, "w:default") === "1",
        para: readParaProps(child(s, "w:pPr")),
        run: readRunProps(child(s, "w:rPr"), theme),
      };
      this.styles.set(id, def);
      if (def.type === "paragraph" && def.isDefault) this.defaultParagraphStyleId = id;
    }
  }

  get(id: string | undefined): StyleDef | undefined {
    return id ? this.styles.get(id) : undefined;
  }

  /** Rantai dari gaya itu sendiri ke induknya (basedOn), dengan penjaga siklus. */
  chain(id: string | undefined): StyleDef[] {
    const out: StyleDef[] = [];
    const seen = new Set<string>();
    let current = this.get(id);
    while (current && !seen.has(current.id)) {
      out.push(current);
      seen.add(current.id);
      current = this.get(current.basedOn);
    }
    return out;
  }

  paragraphStyleId(explicit: string | undefined): string | undefined {
    return explicit ?? this.defaultParagraphStyleId;
  }

  styleName(id: string | undefined): string {
    return this.get(this.paragraphStyleId(id))?.name ?? "";
  }

  /** Properti paragraf efektif: langsung > gaya paragraf (dan induknya) > docDefaults. */
  effectivePara(
    styleId: string | undefined,
    direct: ParaProps,
  ): Required<{ [K in keyof ParaProps]: ParaProps[K] }> {
    const layers = [
      direct,
      ...this.chain(this.paragraphStyleId(styleId)).map((s) => s.para),
      this.defaultsPara,
    ];
    const pick = <K extends keyof ParaProps>(key: K): ParaProps[K] =>
      layers.find((l) => l[key] !== undefined)?.[key];
    return {
      alignment: pick("alignment"),
      lineSpacing: pick("lineSpacing"),
      firstLineCm: pick("firstLineCm"),
    } as Required<ParaProps>;
  }

  /** Properti run efektif: langsung > gaya karakter > gaya paragraf > docDefaults. */
  effectiveRun(
    paraStyleId: string | undefined,
    charStyleId: string | undefined,
    direct: RunProps,
  ): RunProps {
    const layers: RunProps[] = [
      direct,
      ...this.chain(charStyleId).map((s) => s.run),
      ...this.chain(this.paragraphStyleId(paraStyleId)).map((s) => s.run),
      this.defaultsRun,
    ];
    const pick = <K extends keyof RunProps>(key: K): RunProps[K] =>
      layers.find((l) => l[key] !== undefined)?.[key];
    return {
      font: pick("font"),
      sizePt: pick("sizePt"),
      bold: pick("bold"),
      italic: pick("italic"),
    };
  }
}
