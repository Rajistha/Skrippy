import "server-only";
import { count, desc, eq, max } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { extractText, getDocumentProxy } from "unpdf";
import type {
  AdminGuideline,
  GuidelineExtraction,
  GuidelineIn,
  GuidelineTest,
} from "@/lib/schemas";
import type { Db } from "../db";
import { schema } from "../db";
import { AppError, InvalidUpload, NotFound } from "../errors";
import { detectSections, extractRulesFromText } from "../checkers/guideline-extract";
import { parseDocx } from "../checkers/parse/document";
import { runChecks } from "../checkers/registry";
import { resolveRules } from "../checkers/rules";
import { computeScores } from "../checkers/scoring";
import { CATEGORIES } from "../checkers/types";
import type { StorageClient } from "../integrations/storage";
import { validateDocx } from "./file-validation";
import { writeAudit } from "./access";

const { guidelines, theses } = schema;

export const MAX_GUIDELINE_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARS = 2_000_000;
const MAX_DOCX_XML_BYTES = 60 * 1024 * 1024;

export type GuidelineRow = typeof guidelines.$inferSelect;

function out(row: GuidelineRow, thesisCount: number): AdminGuideline {
  return {
    id: row.id,
    name: row.name,
    campus_name: row.campusName,
    version: row.version,
    citation_style: row.citationStyle,
    status: row.status as AdminGuideline["status"],
    rules: row.rules,
    thesis_count: thesisCount,
    updated_at: row.updatedAt.toISOString(),
  };
}

// --- membaca teks berkas pedoman ---------------------------------------------------------

const startsWith = (data: Uint8Array, magic: number[]): boolean =>
  magic.every((b, i) => data[i] === b);

function docxText(data: Uint8Array): string {
  let xml: string | null = null;
  try {
    const files = unzipSync(data, {
      filter: (f) => {
        if (f.name !== "word/document.xml") return false;
        if (f.originalSize > MAX_DOCX_XML_BYTES) throw new Error("too_large");
        return true;
      },
    });
    const entry = files["word/document.xml"];
    xml = entry ? strFromU8(entry) : null;
  } catch {
    throw new InvalidUpload("File .docx rusak atau terlalu besar.");
  }
  if (!xml) throw new InvalidUpload("File bukan dokumen Word (.docx) yang valid.");
  return xml
    .replace(/<w:tab\s*\/>/g, " ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function pdfText(data: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(data);
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch {
    throw new InvalidUpload("PDF tidak bisa dibaca. Pastikan file tidak terkunci kata sandi.");
  }
}

/** Teks polos dari PDF atau .docx. Tidak ada yang disimpan; hanya dibaca lalu dibuang. */
export async function readGuidelineFile(filename: string, data: Uint8Array): Promise<string> {
  const lower = filename.toLowerCase();
  if (data.length === 0) throw new InvalidUpload("File kosong. Pilih file lain.");
  if (data.length > MAX_GUIDELINE_FILE_BYTES)
    throw new InvalidUpload("Ukuran file melebihi 15 MB.");
  let text: string;
  if (lower.endsWith(".pdf")) {
    if (!startsWith(data, [0x25, 0x50, 0x44, 0x46]))
      throw new InvalidUpload("File bukan PDF yang valid.");
    text = await pdfText(data);
  } else if (lower.endsWith(".docx")) {
    if (!startsWith(data, [0x50, 0x4b, 0x03, 0x04])) {
      throw new InvalidUpload("File bukan dokumen Word (.docx) yang valid.");
    }
    text = docxText(data);
  } else {
    throw new InvalidUpload("Hanya file PDF atau .docx yang bisa dibaca.");
  }
  if (text.trim().length < 50) {
    throw new InvalidUpload(
      "Tidak ada teks yang bisa dibaca. PDF hasil pindai (gambar) belum didukung.",
    );
  }
  return text.slice(0, MAX_TEXT_CHARS);
}

/** Teks pedoman menjadi usulan aturan lengkap (hasil deteksi digabung default) untuk mengisi formulir. */
export function buildExtraction(text: string): GuidelineExtraction {
  const { rules, findings } = extractRulesFromText(text);
  return {
    rules: resolveRules(rules) as unknown as Record<string, unknown>,
    findings,
    suggested_sections: detectSections(text),
    text_length: text.length,
  };
}

export function guidelineUploadKey(id: string, filename: string): string {
  const ext = filename.toLowerCase().endsWith(".pdf") ? "pdf" : "docx";
  return `guidelines/tmp/${id}.${ext}`;
}

export async function extractFromStorage(
  storage: StorageClient,
  key: string,
): Promise<GuidelineExtraction> {
  if (!/^guidelines\/tmp\/[0-9a-f-]{36}\.(pdf|docx)$/.test(key)) {
    throw new AppError("Jalur file tidak valid.", "validation_error", 400);
  }
  let data: Uint8Array;
  try {
    data = await storage.download(key);
  } catch {
    throw new InvalidUpload("File belum terunggah. Unggah lagi.");
  }
  try {
    return buildExtraction(await readGuidelineFile(key, data));
  } finally {
    // Berkas pedoman hanya dibutuhkan sekali untuk dibaca.
    await storage.remove([key]).catch(() => undefined);
  }
}

/** Jalankan semua aturan pada naskah contoh dengan aturan yang sedang disusun. Berkas contoh langsung dihapus. */
export async function testGuidelineOnManuscript(
  storage: StorageClient,
  key: string,
  rulesInput: Record<string, unknown>,
): Promise<GuidelineTest> {
  if (!/^guidelines\/tmp\/[0-9a-f-]{36}\.docx$/.test(key)) {
    throw new AppError(
      "Jalur file tidak valid. Naskah contoh harus .docx.",
      "validation_error",
      400,
    );
  }
  let data: Uint8Array;
  try {
    data = await storage.download(key);
  } catch {
    throw new InvalidUpload("File belum terunggah. Unggah lagi.");
  }
  try {
    validateDocx("contoh.docx", data, MAX_GUIDELINE_FILE_BYTES);
    const doc = parseDocx(data);
    const rules = resolveRules(rulesInput);
    const issues = runChecks(doc, rules, [...CATEGORIES]);
    const { total, byCategory } = computeScores(issues, [...CATEGORIES], rules);
    const counts = new Map<string, { severity: string; count: number }>();
    for (const i of issues) {
      const row = counts.get(i.ruleCode) ?? { severity: i.severity, count: 0 };
      row.count++;
      counts.set(i.ruleCode, row);
    }
    return {
      words: doc.wordCount,
      issue_count: issues.length,
      score_total: total,
      score_by_category: byCategory,
      by_rule: [...counts.entries()]
        .map(([rule_code, v]) => ({ rule_code, ...v }))
        .sort((a, b) => b.count - a.count || a.rule_code.localeCompare(b.rule_code)),
    };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new InvalidUpload(
      "Naskah contoh tidak bisa dibaca. Simpan ulang dari Word, lalu unggah lagi.",
    );
  } finally {
    await storage.remove([key]).catch(() => undefined);
  }
}

// --- CRUD -----------------------------------------------------------------------------------

export async function listAllGuidelines(db: Db): Promise<AdminGuideline[]> {
  const rows = await db
    .select()
    .from(guidelines)
    .orderBy(guidelines.name, desc(guidelines.version));
  const counts = await db
    .select({ id: theses.guidelineId, n: count() })
    .from(theses)
    .groupBy(theses.guidelineId);
  const byId = new Map(counts.map((c) => [c.id, c.n]));
  return rows.map((r) => out(r, byId.get(r.id) ?? 0));
}

export async function getGuideline(db: Db, id: string): Promise<AdminGuideline> {
  const [row] = await db.select().from(guidelines).where(eq(guidelines.id, id));
  if (!row) throw new NotFound("Pedoman tidak ditemukan.");
  const [c] = await db.select({ n: count() }).from(theses).where(eq(theses.guidelineId, id));
  return out(row, c?.n ?? 0);
}

async function nextVersion(tx: Pick<Db, "select">, name: string): Promise<number> {
  const [row] = await tx
    .select({ v: max(guidelines.version) })
    .from(guidelines)
    .where(eq(guidelines.name, name));
  return (row?.v ?? 0) + 1;
}

/** Aturan disimpan lengkap (default digabung) agar snapshot cek tidak bergantung pada default kode di masa depan. */
const fullRules = (input: GuidelineIn["rules"]): Record<string, unknown> =>
  resolveRules(input as Record<string, unknown>) as unknown as Record<string, unknown>;

export async function createGuideline(
  db: Db,
  actorId: string,
  input: GuidelineIn,
): Promise<AdminGuideline> {
  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(guidelines)
      .values({
        name: input.name,
        campusName: input.campus_name ?? null,
        version: await nextVersion(tx, input.name),
        citationStyle: input.citation_style,
        rules: fullRules(input.rules),
        status: input.status,
        createdBy: actorId,
      })
      .returning();
    await writeAudit(tx, actorId, "guideline.create", "guidelines", created!.id, {
      status: input.status,
    });
    return created!;
  });
  return out(row, 0);
}

/**
 * Pedoman draft diubah langsung. Pedoman yang sudah terbit atau diarsipkan tidak diubah:
 * perubahan menjadi versi baru, dan versi terbit sebelumnya diarsipkan bila versi baru diterbitkan.
 */
export async function updateGuideline(
  db: Db,
  actorId: string,
  id: string,
  input: GuidelineIn,
): Promise<AdminGuideline> {
  const row = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(guidelines)
      .where(eq(guidelines.id, id))
      .for("update");
    if (!existing) throw new NotFound("Pedoman tidak ditemukan.");
    const values = {
      campusName: input.campus_name ?? null,
      citationStyle: input.citation_style,
      rules: fullRules(input.rules),
      status: input.status,
    };
    if (existing.status === "draft" && existing.name === input.name) {
      const [updated] = await tx
        .update(guidelines)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(guidelines.id, id))
        .returning();
      await writeAudit(tx, actorId, "guideline.update", "guidelines", id, { status: input.status });
      return updated!;
    }
    const [created] = await tx
      .insert(guidelines)
      .values({
        ...values,
        name: input.name,
        version: await nextVersion(tx, input.name),
        createdBy: actorId,
        parentId: existing.id,
      })
      .returning();
    if (
      input.status === "published" &&
      existing.name === input.name &&
      existing.status === "published"
    ) {
      await tx
        .update(guidelines)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(guidelines.id, existing.id));
    }
    await writeAudit(tx, actorId, "guideline.new_version", "guidelines", created!.id, {
      from: existing.id,
    });
    return created!;
  });
  return out(row, 0);
}

export async function setGuidelineStatus(
  db: Db,
  actorId: string,
  id: string,
  status: "draft" | "published" | "archived",
): Promise<AdminGuideline> {
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(guidelines)
      .set({ status, updatedAt: new Date() })
      .where(eq(guidelines.id, id))
      .returning();
    if (!updated) throw new NotFound("Pedoman tidak ditemukan.");
    await writeAudit(tx, actorId, `guideline.${status}`, "guidelines", id);
  });
  return getGuideline(db, id);
}
