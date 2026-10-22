import { XMLParser } from "fast-xml-parser";

/** Simpul dari fast-xml-parser dengan preserveOrder: { "w:p": XNode[], ":@": { "@_w:val": "x" } }. */
export type XNode = Record<string, unknown>;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  // Entitas standar (&amp; dst) saja. DTD ditolak sebelum parse, lihat parseXml.
  processEntities: true,
  htmlEntities: false,
});

export class UnsafeXmlError extends Error {
  constructor() {
    super("XML memuat DTD atau entitas eksternal.");
    this.name = "UnsafeXmlError";
  }
}

export function parseXml(xml: string): XNode[] {
  // Dokumen Word tidak memakai DTD. Tolak apa pun yang mencoba mendeklarasikan entitas.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new UnsafeXmlError();
  return parser.parse(xml) as XNode[];
}

export function tagOf(node: XNode): string | undefined {
  for (const key of Object.keys(node)) if (key !== ":@") return key;
  return undefined;
}

export function kids(node: XNode): XNode[] {
  const tag = tagOf(node);
  const value = tag ? node[tag] : undefined;
  return Array.isArray(value) ? (value as XNode[]) : [];
}

export function attr(node: XNode, name: string): string | undefined {
  const attrs = node[":@"] as Record<string, string> | undefined;
  return attrs?.[`@_${name}`];
}

export function child(node: XNode | undefined, tag: string): XNode | undefined {
  return node ? kids(node).find((k) => tagOf(k) === tag) : undefined;
}

export function children(node: XNode | undefined, tag: string): XNode[] {
  return node ? kids(node).filter((k) => tagOf(k) === tag) : [];
}
