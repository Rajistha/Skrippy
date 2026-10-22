/**
 * Perbandingan temuan antarversi naskah (Fase 2). Murni.
 * Temuan dicocokkan lewat fingerprint (kode aturan + kutipan + bab). Bila satu fingerprint muncul
 * beberapa kali, pencocokan dilakukan satu lawan satu, sisanya dianggap baru atau sudah diperbaiki.
 */

export type Comparable = { id: string; category: string; fingerprint: string | null };

export type Comparison<T extends Comparable> = {
  /** Ada di versi lama, tidak ada lagi di versi ini. */
  fixed: T[];
  /** Ada di versi ini, belum ada di versi lama. */
  added: T[];
  /** Ada di keduanya (id dari versi ini). */
  remaining: T[];
};

export function compareIssues<T extends Comparable>(
  previous: T[],
  current: T[],
  categories: string[],
): Comparison<T> {
  const inScope = (i: T): boolean => categories.includes(i.category);
  const prev = previous.filter(inScope);
  const cur = current.filter(inScope);

  // Tanpa fingerprint tidak bisa dicocokkan: anggap temuan itu unik.
  const pool = new Map<string, T[]>();
  const unmatchedPrev: T[] = [];
  for (const p of prev) {
    if (!p.fingerprint) {
      unmatchedPrev.push(p);
      continue;
    }
    const list = pool.get(p.fingerprint) ?? [];
    list.push(p);
    pool.set(p.fingerprint, list);
  }

  const added: T[] = [];
  const remaining: T[] = [];
  for (const c of cur) {
    const list = c.fingerprint ? pool.get(c.fingerprint) : undefined;
    if (list && list.length > 0) {
      list.pop();
      remaining.push(c);
    } else {
      added.push(c);
    }
  }
  const fixed = [...unmatchedPrev, ...[...pool.values()].flat()];
  return { fixed, added, remaining };
}
