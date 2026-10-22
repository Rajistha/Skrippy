import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { ignoreKey, type IgnoreEntry } from "../checkers/ignore";
import type { Issue } from "../checkers/types";
import type { Db, Executor } from "../db";
import { schema } from "../db";
import { AppError, NotFound } from "../errors";
import { writeAudit } from "./access";

const { dictionaryEntries, ignoredFindings } = schema;

export type DictionaryKind = "nonstandard" | "foreign";
export type DictionaryEntry = typeof dictionaryEntries.$inferSelect;

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

export async function listDictionary(db: Executor): Promise<DictionaryEntry[]> {
  return db
    .select()
    .from(dictionaryEntries)
    .orderBy(asc(dictionaryEntries.kind), asc(dictionaryEntries.term));
}

export async function addDictionaryEntry(
  db: Db,
  actorId: string,
  input: { kind: DictionaryKind; term: string; replacement?: string | null },
): Promise<DictionaryEntry> {
  const term = norm(input.term);
  const replacement = input.replacement ? norm(input.replacement) : null;
  if (input.kind === "nonstandard" && !replacement)
    throw new AppError("Bentuk baku wajib diisi untuk kata tidak baku.", "replacement_required");
  if (input.kind === "nonstandard" && replacement === term)
    throw new AppError("Bentuk baku harus berbeda dari kata tidak baku.", "replacement_same");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(dictionaryEntries)
      .values({
        kind: input.kind,
        term,
        replacement: input.kind === "nonstandard" ? replacement : null,
        createdBy: actorId,
      })
      .onConflictDoUpdate({
        target: [dictionaryEntries.kind, dictionaryEntries.term],
        set: { replacement: input.kind === "nonstandard" ? replacement : null },
      })
      .returning();
    await writeAudit(tx, actorId, "dictionary.upsert", "dictionary_entries", row!.id, {
      kind: input.kind,
    });
    return row!;
  });
}

export async function deleteDictionaryEntry(db: Db, actorId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(dictionaryEntries)
      .where(eq(dictionaryEntries.id, id))
      .returning();
    if (removed.length === 0) throw new NotFound("Entri kamus tidak ditemukan.");
    await writeAudit(tx, actorId, "dictionary.delete", "dictionary_entries", id, {
      kind: removed[0]!.kind,
    });
  });
}

/** Bentuk yang disalin ke snapshot pedoman saat cek dibuat. */
export async function dictionarySnapshot(
  db: Executor,
): Promise<{ nonstandard: Record<string, string>; foreign: string[] }> {
  const rows = await listDictionary(db);
  return {
    nonstandard: Object.fromEntries(
      rows
        .filter((r) => r.kind === "nonstandard" && r.replacement)
        .map((r) => [r.term, r.replacement!]),
    ),
    foreign: rows.filter((r) => r.kind === "foreign").map((r) => r.term),
  };
}

// --- daftar abaikan per pengguna ----------------------------------------------------------------

export async function listIgnored(db: Executor, userId: string) {
  return db
    .select()
    .from(ignoredFindings)
    .where(eq(ignoredFindings.userId, userId))
    .orderBy(asc(ignoredFindings.ruleCode), asc(ignoredFindings.text));
}

export async function ignoreEntries(db: Executor, userId: string): Promise<IgnoreEntry[]> {
  return (await listIgnored(db, userId)).map((r) => ({ ruleCode: r.ruleCode, text: r.text }));
}

const MAX_IGNORED_PER_USER = 300;

export async function addIgnored(
  db: Db,
  userId: string,
  issue: Pick<Issue, "excerpt" | "message"> & { ruleCode: string },
) {
  const text = ignoreKey(issue);
  if (text === "") throw new AppError("Temuan ini tidak bisa diabaikan permanen.", "not_ignorable");
  const existing = await listIgnored(db, userId);
  if (existing.length >= MAX_IGNORED_PER_USER)
    throw new AppError("Daftar abaikan sudah penuh. Hapus sebagian dulu.", "ignored_full");
  const [row] = await db
    .insert(ignoredFindings)
    .values({ userId, ruleCode: issue.ruleCode, text })
    .onConflictDoNothing()
    .returning();
  return row ?? existing.find((r) => r.ruleCode === issue.ruleCode && r.text === text)!;
}

export async function removeIgnored(db: Db, userId: string, id: string): Promise<void> {
  const removed = await db
    .delete(ignoredFindings)
    .where(and(eq(ignoredFindings.id, id), eq(ignoredFindings.userId, userId)))
    .returning();
  if (removed.length === 0) throw new NotFound("Entri tidak ditemukan.");
}
