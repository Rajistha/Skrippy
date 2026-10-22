import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

const id = () =>
  uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const tstz = (name: string) => timestamp(name, { withTimezone: true });

/** id sama dengan auth.users.id (FK ditambahkan di migrasi kustom). Dibuat saat kode pertama ditukar. */
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    fullName: varchar("full_name", { length: 200 }),
    avatarUrl: varchar("avatar_url", { length: 1000 }),
    role: varchar("role", { length: 20 }).notNull().default("user"), // user | superadmin
    defaultGuidelineId: uuid("default_guideline_id"),
    trialUsed: boolean("trial_used").notNull().default(false),
    deactivatedAt: tstz("deactivated_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ix_profiles_email_lower").on(sql`lower(${t.email})`)],
);

/** Sekelompok kode yang dibuat bersamaan (satu "batch"), dengan nomor urut dan catatan. */
export const codeBatches = pgTable("code_batches", {
  id: id(),
  /** Nomor urut tampilan: Batch 1, Batch 2, dan seterusnya. */
  number: integer("number").notNull(),
  note: varchar("note", { length: 300 }),
  createdBy: uuid("created_by").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const accessCodes = pgTable(
  "access_codes",
  {
    id: id(),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    codeHint: varchar("code_hint", { length: 8 }).notNull(),
    /** Batch asal kode. Kosong untuk kode lama yang dibuat sebelum ada batch. */
    batchId: uuid("batch_id").references(() => codeBatches.id),
    /** Kode asli terenkripsi (AES-GCM) agar admin bisa melihat dan menyalinnya lagi. Kosong untuk kode lama. */
    codeEncrypted: text("code_encrypted"),
    kind: varchar("kind", { length: 20 }).notNull(), // trial | package
    durationDays: integer("duration_days").notNull(),
    checkLimit: integer("check_limit"),
    dailyCheckLimit: integer("daily_check_limit").notNull(),
    maxRedemptions: integer("max_redemptions").notNull().default(1),
    redemptionCount: integer("redemption_count").notNull().default(0),
    redeemBefore: tstz("redeem_before").notNull(),
    recipientNote: varchar("recipient_note", { length: 300 }),
    priceIdr: integer("price_idr"),
    paymentMethod: varchar("payment_method", { length: 20 }),
    paidOn: date("paid_on", { mode: "string" }),
    paymentNote: varchar("payment_note", { length: 500 }),
    createdBy: uuid("created_by").notNull(),
    revokedAt: tstz("revoked_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_access_codes_hash").on(t.codeHash),
    check("ck_code_redemptions", sql`${t.redemptionCount} <= ${t.maxRedemptions}`),
  ],
);

export const accessGrants = pgTable(
  "access_grants",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    accessCodeId: uuid("access_code_id").references(() => accessCodes.id),
    kind: varchar("kind", { length: 20 }).notNull(), // trial | package
    startsAt: tstz("starts_at").notNull(),
    endsAt: tstz("ends_at").notNull(),
    checkLimit: integer("check_limit"),
    dailyCheckLimit: integer("daily_check_limit").notNull(),
    checksUsed: integer("checks_used").notNull().default(0),
    revokedAt: tstz("revoked_at"),
    revokeReason: varchar("revoke_reason", { length: 300 }),
    /** Diisi saat pengingat email "akses hampir habis" terkirim, agar tidak terkirim dua kali. */
    reminderSentAt: tstz("reminder_sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("ix_grants_user_ends").on(t.userId, t.endsAt.desc()),
    check(
      "ck_grant_checks_used",
      sql`${t.checkLimit} IS NULL OR ${t.checksUsed} <= ${t.checkLimit}`,
    ),
  ],
);

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: jsonb("value").notNull().$type<unknown>(),
  updatedBy: uuid("updated_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const guidelines = pgTable(
  "guidelines",
  {
    id: id(),
    parentId: uuid("parent_id"),
    name: varchar("name", { length: 200 }).notNull(),
    campusName: varchar("campus_name", { length: 200 }),
    version: integer("version").notNull().default(1),
    citationStyle: varchar("citation_style", { length: 20 }).notNull().default("apa"),
    rules: jsonb("rules").notNull().$type<Record<string, unknown>>(),
    status: varchar("status", { length: 20 }).notNull().default("draft"), // draft | published | archived
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uq_guideline_name_version").on(t.name, t.version)],
);

export const theses = pgTable(
  "theses",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    guidelineId: uuid("guideline_id")
      .notNull()
      .references(() => guidelines.id),
    title: varchar("title", { length: 300 }).notNull(),
    lastActivityAt: tstz("last_activity_at").notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ix_theses_last_activity").on(t.lastActivityAt)],
);

export const documents = pgTable(
  "documents",
  {
    id: id(),
    thesisId: uuid("thesis_id")
      .notNull()
      .references(() => theses.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    originalFilename: varchar("original_filename", { length: 300 }).notNull(),
    storageKey: varchar("storage_key", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 150 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** Null sampai unggahan dikonfirmasi dan divalidasi server. */
    sha256: varchar("sha256", { length: 64 }),
    pageCount: integer("page_count"),
    wordCount: integer("word_count"),
    deletedAt: tstz("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uq_document_version").on(t.thesisId, t.versionNo)],
);

export const checkRuns = pgTable(
  "check_runs",
  {
    id: id(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    accessGrantId: uuid("access_grant_id")
      .notNull()
      .references(() => accessGrants.id),
    guidelineSnapshot: jsonb("guideline_snapshot").notNull().$type<Record<string, unknown>>(),
    checkTypes: text("check_types").array().notNull(),
    status: varchar("status", { length: 20 }).notNull().default("queued"), // queued | processing | completed | failed
    countsTowardLimit: boolean("counts_toward_limit").notNull().default(true),
    scoreTotal: numeric("score_total", { precision: 5, scale: 1 }),
    scoreByCategory: jsonb("score_by_category").$type<Record<string, number>>(),
    issueCount: integer("issue_count").notNull().default(0),
    /** Statistik naskah (ukuran bab, keterbacaan, umur sumber). Null pada cek lama. */
    stats: jsonb("stats").$type<Record<string, unknown>>(),
    engineVersion: varchar("engine_version", { length: 40 }),
    /** Null bila AI tidak diminta. completed | partial | failed. Kegagalan AI tidak menggagalkan cek aturan. */
    aiStatus: varchar("ai_status", { length: 20 }),
    aiNote: varchar("ai_note", { length: 160 }),
    errorCode: varchar("error_code", { length: 60 }),
    startedAt: tstz("started_at"),
    finishedAt: tstz("finished_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("ix_check_runs_requester_created").on(t.requestedBy, t.createdAt),
    index("ix_check_runs_document_created").on(t.documentId, t.createdAt.desc()),
    index("ix_check_runs_active")
      .on(t.status, t.startedAt)
      .where(sql`${t.status} IN ('queued','processing')`),
  ],
);

export const checkIssues = pgTable(
  "check_issues",
  {
    id: id(),
    checkRunId: uuid("check_run_id")
      .notNull()
      .references(() => checkRuns.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 20 }).notNull(),
    ruleCode: varchar("rule_code", { length: 20 }).notNull(),
    severity: varchar("severity", { length: 20 }).notNull(),
    message: varchar("message", { length: 500 }).notNull(),
    suggestion: varchar("suggestion", { length: 500 }),
    /** Kutipan pendek, maksimal 300 karakter. */
    excerpt: text("excerpt"),
    location: jsonb("location").notNull().$type<Record<string, unknown>>(),
    fingerprint: varchar("fingerprint", { length: 64 }),
    userStatus: varchar("user_status", { length: 20 }).notNull().default("open"), // open | ignored | false_positive | done
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("ix_issues_run_cat_sev").on(t.checkRunId, t.category, t.severity),
    index("ix_issues_run_fingerprint").on(t.checkRunId, t.fingerprint),
  ],
);

/** Percobaan penukaran kode, untuk rate limit tanpa Redis. Baris lebih dari 7 hari dihapus job harian. */
export const redeemAttempts = pgTable(
  "redeem_attempts",
  {
    id: id(),
    userId: uuid("user_id").notNull(),
    success: boolean("success").notNull(),
    attemptedAt: tstz("attempted_at").notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ix_redeem_attempts_user_time").on(t.userId, t.attemptedAt)],
);

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  actorId: uuid("actor_id").notNull(),
  action: varchar("action", { length: 60 }).notNull(),
  targetType: varchar("target_type", { length: 40 }),
  targetId: uuid("target_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Tautan baca-saja ke satu laporan (Fase 2). Token asli hanya dikembalikan sekali; yang disimpan hash-nya. */
export const shareLinks = pgTable(
  "share_links",
  {
    id: id(),
    checkRunId: uuid("check_run_id")
      .notNull()
      .references(() => checkRuns.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: tstz("expires_at").notNull(),
    revokedAt: tstz("revoked_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_share_links_hash").on(t.tokenHash),
    index("ix_share_links_run").on(t.checkRunId),
  ],
);

/** Rahasia integrasi (mis. kunci API AI), disimpan terenkripsi. Tidak pernah dikembalikan ke browser. */
export const integrationSecrets = pgTable("integration_secrets", {
  provider: varchar("provider", { length: 40 }).primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  hint: varchar("hint", { length: 20 }).notNull(),
  updatedBy: uuid("updated_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Kamus tambahan yang dikelola admin: pasangan kata tidak baku dan istilah asing (EJA-001, EJA-006). */
export const dictionaryEntries = pgTable(
  "dictionary_entries",
  {
    id: id(),
    kind: varchar("kind", { length: 20 }).notNull(), // nonstandard | foreign
    term: varchar("term", { length: 80 }).notNull(),
    /** Bentuk baku untuk kind = nonstandard; kosong untuk istilah asing. */
    replacement: varchar("replacement", { length: 80 }),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uq_dictionary_kind_term").on(t.kind, t.term)],
);

/** Temuan yang diminta pengguna untuk selalu diabaikan (per aturan dan teks), berlaku di cek berikutnya. */
export const ignoredFindings = pgTable(
  "ignored_findings",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    ruleCode: varchar("rule_code", { length: 20 }).notNull(),
    /** Teks temuan yang dinormalkan (huruf kecil, spasi tunggal), maksimal 120 karakter. */
    text: varchar("text", { length: 120 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("uq_ignored_user_rule_text").on(t.userId, t.ruleCode, t.text)],
);

/** Kunci giliran analisis AI lintas instance server: satu baris per antrean, kedaluwarsa otomatis bila pemegangnya mati. */
export const aiSlots = pgTable("ai_slots", {
  key: varchar("key", { length: 40 }).primaryKey(),
  holder: uuid("holder").notNull(),
  lockedUntil: tstz("locked_until").notNull(),
});
