/** Skema zod untuk setiap request dan response. Dipakai bersama oleh client dan server. */
import { z } from "zod";

export const checkTypeSchema = z.enum(["format", "structure", "spelling", "citation", "ai"]);
export const severitySchema = z.enum(["critical", "major", "minor"]);
const iso = z.string(); // tanggal ISO 8601 (UTC)
const uuid = z.string().uuid();

// --- respons ----------------------------------------------------------------

export const accessStatusSchema = z.object({
  state: z.enum(["none", "trial", "package", "expired"]),
  ends_at: iso.nullable(),
  days_left: z.number().nullable(),
  checks_left: z.number().nullable(),
  daily_limit: z.number().nullable(),
});

export const profileSchema = z.object({
  id: uuid,
  email: z.string(),
  full_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  role: z.enum(["user", "superadmin"]),
});

export const meSchema = z.object({ profile: profileSchema, access: accessStatusSchema });

export const publicInfoSchema = z.object({
  package_enabled: z.boolean(),
  package_name: z.string(),
  package_price_idr: z.number(),
  package_duration_days: z.number(),
  trial_enabled: z.boolean(),
  trial_duration_days: z.number(),
  trial_check_limit: z.number(),
  whatsapp: z.string(),
});

export const guidelineSchema = z.object({
  id: uuid,
  name: z.string(),
  campus_name: z.string().nullable(),
  version: z.number(),
  citation_style: z.string(),
});

export const thesisSchema = z.object({
  id: uuid,
  title: z.string(),
  guideline_id: uuid,
  last_activity_at: iso,
  created_at: iso,
});

export const documentSchema = z.object({
  id: uuid,
  thesis_id: uuid,
  version_no: z.number(),
  original_filename: z.string(),
  size_bytes: z.number(),
  word_count: z.number().nullable(),
  created_at: iso,
  latest_score: z.number().nullable(),
  latest_run_id: uuid.nullable(),
});

export const thesisDetailSchema = thesisSchema.extend({ documents: z.array(documentSchema) });

export const uploadStartSchema = z.object({
  document_id: uuid,
  upload_url: z.string().url(),
  version_no: z.number(),
});

export const manuscriptStatsSchema = z.object({
  words: z.number(),
  paragraphs: z.number(),
  tables: z.number(),
  figures: z.number(),
  footnotes: z.number(),
  chapters: z.array(z.object({ name: z.string(), words: z.number(), citations: z.number() })),
  readability: z.object({
    sentences: z.number(),
    avgSentenceWords: z.number(),
    longSentencePct: z.number(),
    passivePct: z.number(),
  }),
  sources: z.object({
    total: z.number(),
    recentPct: z.number().nullable(),
    medianYear: z.number().nullable(),
  }),
});

export const checkRunSchema = z.object({
  id: uuid,
  document_id: uuid,
  status: z.enum(["queued", "processing", "completed", "failed"]),
  check_types: z.array(z.string()),
  score_total: z.number().nullable(),
  score_by_category: z.record(z.string(), z.number()).nullable(),
  issue_count: z.number(),
  stats: manuscriptStatsSchema.nullable(),
  error_code: z.string().nullable(),
  /** Null bila AI tidak diminta; completed | partial | failed. */
  ai_status: z.string().nullable(),
  ai_note: z.string().nullable(),
  created_at: iso,
  finished_at: iso.nullable(),
});

export const dashboardSchema = z.object({
  thesis: thesisSchema.nullable(),
  documents: z.array(documentSchema),
  runs: z.array(checkRunSchema),
});

export const issueSchema = z.object({
  id: uuid,
  category: z.string(),
  rule_code: z.string(),
  severity: severitySchema,
  message: z.string(),
  suggestion: z.string().nullable(),
  excerpt: z.string().nullable(),
  location: z.object({
    paragraph_index: z.number().nullable().optional(),
    page: z.number().nullable().optional(),
    heading_path: z.array(z.string()).optional(),
    char_start: z.number().nullable().optional(),
    char_end: z.number().nullable().optional(),
  }),
  user_status: z.enum(["open", "ignored", "false_positive", "done"]),
});

export const createdCodeSchema = z.object({
  id: uuid,
  batch_id: uuid.nullable(),
  code: z.string(), // hanya muncul sekali
  kind: z.enum(["trial", "package"]),
  redeem_before: iso,
  duration_days: z.number(),
  check_limit: z.number().nullable(),
  recipient_note: z.string().nullable(),
  message: z.string(),
});

export const batchSummarySchema = z.object({
  id: z.string(),
  /** Nomor tampilan ("Batch 3"); null untuk kelompok kode lama. */
  number: z.number().nullable(),
  note: z.string().nullable(),
  created_at: iso,
  total: z.number(),
  /** Penebusan dari seluruh kuota, mis. 3 dari 10. */
  redeemed: z.number(),
  capacity: z.number(),
  /** Batas terjauh; null bila tanpa batas waktu. */
  valid_until: iso.nullable(),
  status: z.enum(["active", "used", "expired"]),
});

export const batchCodeSchema = z.object({
  id: uuid,
  /** Kode asli (didekripsi untuk admin). Null untuk kode lama yang hanya punya hash. */
  code: z.string().nullable(),
  code_hint: z.string(),
  status: z.enum(["active", "used", "expired", "revoked"]),
  redemption_count: z.number(),
  max_redemptions: z.number(),
  redeemed_by: z.array(z.string()),
});

export const batchDetailSchema = z.object({
  batch: batchSummarySchema,
  codes: z.array(batchCodeSchema),
});

export const adminUserSchema = z.object({
  id: uuid,
  email: z.string(),
  full_name: z.string().nullable(),
  role: z.enum(["user", "superadmin"]),
  /** Akun pemilik: peran tidak bisa diubah. */
  is_owner: z.boolean(),
  created_at: iso,
  /** Judul skripsi terbaru; null bila belum punya. */
  thesis_title: z.string().nullable(),
  access: accessStatusSchema,
  checks_used: z.number(),
});
export const grantInSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lifetime") }),
  z.object({ kind: z.literal("trial"), days: z.number().int().min(1).max(365) }),
]);
export type GrantIn = z.infer<typeof grantInSchema>;
export const roleInSchema = z.object({ role: z.enum(["user", "superadmin"]) });

export const summarySchema = z.object({
  active_users: z.number(),
  active_trials: z.number(),
  active_packages: z.number(),
  payments_this_month_idr: z.number(),
  checks_last_7_days: z.number(),
});

// --- request -----------------------------------------------------------------

export const redeemInSchema = z.object({ code: z.string().min(4).max(40) });
export const thesisInSchema = z.object({
  title: z.string().trim().min(1).max(300),
  guideline_id: uuid,
});
export const uploadStartInSchema = z.object({ filename: z.string().min(1).max(300) });
export const runCheckInSchema = z.object({
  check_types: z.array(checkTypeSchema).nullish(),
  /** Kode aturan yang dilewati pada cek ini, mis. "EJA-010". */
  skip_rules: z
    .array(z.string().regex(/^[A-Z]{3}-\d{3}$/))
    .max(100)
    .nullish(),
});
export const issueStatusInSchema = z.object({
  user_status: z.enum(["open", "ignored", "false_positive", "done"]),
});

export const createCodesInSchema = z.object({
  kind: z.enum(["trial", "package"]),
  count: z.number().int().min(1).max(500).default(1),
  max_redemptions: z.number().int().min(1).max(1000).default(1),
  /** Tanggal terakhir kode boleh ditukar (WIB). Kosong: tanpa batas. */
  valid_until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  recipient_note: z.string().max(300).nullish(),
  price_idr: z.number().int().min(0).nullish(),
  payment_method: z.enum(["transfer", "qris", "tunai"]).nullish(),
  paid_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  payment_note: z.string().max(500).nullish(),
});
export const extendInSchema = z.object({
  days: z.number().int().min(1).max(365),
  reason: z.string().trim().min(1).max(300),
});
export const stopInSchema = z.object({ reason: z.string().trim().min(1).max(300) });
export const settingsInSchema = z.object({
  values: z.record(z.string(), z.union([z.string(), z.number()])),
});

// --- pedoman (admin) ---------------------------------------------------------------

const cm = z.number().min(0.5).max(10);
const align = z.enum(["left", "center", "right", "justify"]);
const pos = z.enum(["above", "below"]);

/** Aturan yang boleh diisi admin. Kunci yang kosong diisi default saat disimpan. */
export const rulesInputSchema = z
  .object({
    page: z
      .object({
        size: z.string().trim().min(1).max(20),
        margins_cm: z.object({ left: cm, top: cm, right: cm, bottom: cm }).partial(),
        margin_tolerance_cm: z.number().min(0).max(2),
      })
      .partial(),
    body: z
      .object({
        font_family: z.string().trim().min(1).max(60),
        font_size_pt: z.number().min(8).max(20),
        line_spacing: z.union([
          z.number().min(1).max(3),
          z.array(z.number().min(1).max(3)).min(1).max(4),
        ]),
        first_line_indent_cm: z.number().min(0).max(5),
        alignment: align,
      })
      .partial(),
    chapter_heading: z
      .object({
        pattern: z.string().max(200),
        uppercase: z.boolean(),
        alignment: align,
        bold: z.boolean(),
      })
      .partial(),
    captions: z
      .object({ table_position: pos, figure_position: pos, numbering: z.string().max(40) })
      .partial(),
    required_sections: z.array(z.string().trim().min(1).max(80)).max(40),
    min_chapter_words: z.number().int().min(0).max(20000),
    subheading: z
      .object({ bold: z.boolean(), capitalization: z.enum(["title", "sentence", "any"]) })
      .partial(),
    reference_line_spacing: z.number().min(1).max(3),
    required_subsections: z.record(
      z.string().max(40),
      z.array(z.string().trim().min(1).max(80)).max(20),
    ),
    max_sentence_words: z.number().int().min(10).max(200),
    methodology_keywords: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(80),
          any: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
        }),
      )
      .max(10),
    abstract_words: z
      .object({ min: z.number().int().min(0).max(2000), max: z.number().int().min(1).max(5000) })
      .partial(),
    citation: z
      .object({
        style: z.string().trim().min(1).max(20),
        max_source_age_years: z.number().int().min(1).max(50),
        max_old_source_ratio: z.number().min(0).max(1),
      })
      .partial(),
    disabled_rules: z.array(z.string().max(20)).max(60),
  })
  .partial();

export const guidelineInSchema = z.object({
  name: z.string().trim().min(3).max(200),
  campus_name: z.string().trim().max(200).nullable().optional(),
  citation_style: z.string().trim().min(1).max(20),
  status: z.enum(["draft", "published"]),
  rules: rulesInputSchema,
});

export const guidelineStatusInSchema = z.object({
  status: z.enum(["draft", "published", "archived"]),
});
export const guidelineUploadInSchema = z.object({ filename: z.string().trim().min(1).max(200) });
export const guidelineTestInSchema = z.object({
  path: z.string().min(1).max(300),
  rules: rulesInputSchema,
});
export const guidelineTestSchema = z.object({
  words: z.number(),
  issue_count: z.number(),
  score_total: z.number(),
  score_by_category: z.record(z.string(), z.number()),
  /** Jumlah temuan per aturan, dari yang terbanyak. */
  by_rule: z.array(z.object({ rule_code: z.string(), severity: z.string(), count: z.number() })),
});
export type GuidelineTestIn = z.infer<typeof guidelineTestInSchema>;
export type GuidelineTest = z.infer<typeof guidelineTestSchema>;

export const guidelineExtractInSchema = z.object({ path: z.string().min(1).max(300) });

export const adminGuidelineSchema = z.object({
  id: uuid,
  name: z.string(),
  campus_name: z.string().nullable(),
  version: z.number(),
  citation_style: z.string(),
  status: z.enum(["draft", "published", "archived"]),
  rules: z.record(z.string(), z.unknown()),
  thesis_count: z.number(),
  updated_at: iso,
});

export const guidelineExtractionSchema = z.object({
  /** Aturan lengkap (hasil deteksi digabung dengan default) untuk mengisi formulir. */
  rules: z.record(z.string(), z.unknown()),
  findings: z.array(
    z.object({
      path: z.string(),
      label: z.string(),
      value: z.union([z.string(), z.number()]),
      evidence: z.string(),
    }),
  ),
  suggested_sections: z.array(z.string()),
  text_length: z.number(),
});

export type GuidelineIn = z.infer<typeof guidelineInSchema>;
export type AdminGuideline = z.infer<typeof adminGuidelineSchema>;
export type GuidelineExtraction = z.infer<typeof guidelineExtractionSchema>;
export type GuidelineUpload = { path: string; upload_url: string };

// --- AI (Fase 3) ---------------------------------------------------------------------

export const aiProviderSchema = z.enum(["anthropic", "openai", "gemini", "openai_compatible"]);
export const aiStatusSchema = z.object({
  provider: aiProviderSchema,
  connected_providers: z.array(aiProviderSchema),
  base_url: z.string(),
  connected: z.boolean(),
  enabled: z.boolean(),
  available: z.boolean(),
  model: z.string(),
  key_hint: z.string().nullable(),
  daily_limit: z.number(),
  allow_trial: z.boolean(),
});
export const aiConfigInSchema = z.object({
  provider: aiProviderSchema.optional(),
  api_key: z.string().trim().min(8).max(500).optional(),
  base_url: z.string().trim().max(300).optional(),
  model: z.string().trim().min(3).max(100).optional(),
  enabled: z.boolean().optional(),
  daily_limit: z.number().int().min(1).max(100).optional(),
  allow_trial: z.boolean().optional(),
});
/** Untuk pengguna: bisakah saya memakai AI sekarang, dan bila tidak, kenapa. */
export const aiUserStatusSchema = z.object({
  available: z.boolean(),
  can_use: z.boolean(),
  reason: z.enum(["not_connected", "package_only", "daily_limit"]).nullable(),
  used_today: z.number(),
  daily_limit: z.number(),
});
export const aiModelsInSchema = z.object({
  provider: aiProviderSchema,
  api_key: z.string().trim().max(500).optional(),
  base_url: z.string().trim().max(300).optional(),
});
export const aiModelListSchema = z.object({
  models: z.array(z.object({ id: z.string(), label: z.string() })),
  source: z.enum(["provider", "fallback"]),
  note: z.string().nullable(),
});
export type AiModelList = z.infer<typeof aiModelListSchema>;
export type AiProvider = z.infer<typeof aiProviderSchema>;
export type AiStatusAdmin = z.infer<typeof aiStatusSchema>;
export type AiConfigIn = z.infer<typeof aiConfigInSchema>;
export type AiUserStatus = z.infer<typeof aiUserStatusSchema>;

// --- perbandingan versi (Fase 2) -----------------------------------------------------

const runBrief = z.object({
  run_id: uuid,
  version_no: z.number(),
  score_total: z.number().nullable(),
  created_at: iso,
});
export const scoreTrendPointSchema = z.object({
  run_id: uuid,
  version_no: z.number(),
  score_total: z.number(),
  issue_count: z.number(),
  created_at: iso,
});
export type ScoreTrendPoint = z.infer<typeof scoreTrendPointSchema>;

export const comparisonSchema = z.object({
  /** Null bila tidak ada versi sebelumnya yang sudah dicek. */
  base: runBrief.nullable(),
  current: runBrief,
  counts: z.object({ fixed: z.number(), added: z.number(), remaining: z.number() }),
  score_delta: z.number().nullable(),
  fixed: z.array(issueSchema),
  added: z.array(issueSchema),
  /** Kategori yang dibandingkan (yang dijalankan di kedua cek). */
  categories: z.array(z.string()),
  /** Jumlah kata per bab di kedua versi; kosong bila salah satu cek belum punya statistik. */
  chapters: z.array(z.object({ name: z.string(), base_words: z.number(), words: z.number() })),
});
export type Comparison = z.infer<typeof comparisonSchema>;

// --- tautan berbagi (Fase 2) ---------------------------------------------------------

export const shareLinkSchema = z.object({ id: uuid, expires_at: iso, created_at: iso });
export const createdShareSchema = z.object({ link: shareLinkSchema, url: z.string() });
export const sharedReportSchema = z.object({
  thesis_title: z.string(),
  version_no: z.number(),
  checked_at: iso,
  expires_at: iso,
  score_total: z.number().nullable(),
  score_by_category: z.record(z.string(), z.number()),
  issues: z.array(issueSchema),
});
export type ShareLink = z.infer<typeof shareLinkSchema>;
export type CreatedShare = z.infer<typeof createdShareSchema>;
export type SharedReport = z.infer<typeof sharedReportSchema>;

export type Me = z.infer<typeof meSchema>;
export type AccessStatus = z.infer<typeof accessStatusSchema>;
export type PublicInfo = z.infer<typeof publicInfoSchema>;
export type Guideline = z.infer<typeof guidelineSchema>;
export type Thesis = z.infer<typeof thesisSchema>;
export type ThesisDetail = z.infer<typeof thesisDetailSchema>;
export type DocumentItem = z.infer<typeof documentSchema>;
export type CheckRun = z.infer<typeof checkRunSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type Issue = z.infer<typeof issueSchema>;
export type CheckType = z.infer<typeof checkTypeSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type BatchSummary = z.infer<typeof batchSummarySchema>;
export type BatchCode = z.infer<typeof batchCodeSchema>;
export type BatchDetail = z.infer<typeof batchDetailSchema>;
export type CreatedCode = z.infer<typeof createdCodeSchema>;
export type Summary = z.infer<typeof summarySchema>;
export type CreateCodesIn = z.infer<typeof createCodesInSchema>;
export type UploadStart = z.infer<typeof uploadStartSchema>;
/** Empat kategori aturan (selalu tersedia). AI dipilih terpisah karena opsional. */
export const CHECK_TYPES: CheckType[] = ["format", "structure", "spelling", "citation"];
/** Semua kategori yang bisa muncul di laporan. */
export const REPORT_CATEGORIES: CheckType[] = [...CHECK_TYPES, "ai"];

// --- kamus admin dan daftar abaikan --------------------------------------------------------

export const dictionaryEntrySchema = z.object({
  id: uuid,
  kind: z.enum(["nonstandard", "foreign"]),
  term: z.string(),
  replacement: z.string().nullable(),
});
export const dictionaryInSchema = z.object({
  kind: z.enum(["nonstandard", "foreign"]),
  term: z.string().trim().min(2).max(80),
  replacement: z.string().trim().max(80).nullish(),
});
export const ignoredEntrySchema = z.object({
  id: uuid,
  rule_code: z.string(),
  text: z.string(),
});
export type DictionaryEntryOut = z.infer<typeof dictionaryEntrySchema>;
export type DictionaryIn = z.infer<typeof dictionaryInSchema>;
export type IgnoredEntry = z.infer<typeof ignoredEntrySchema>;
