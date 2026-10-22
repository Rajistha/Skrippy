-- Skrippy: setup database lengkap untuk Supabase SQL Editor.
-- Gabungan drizzle/0000 sampai 0003.
-- Jalankan SEKALI pada database yang belum memiliki tabel Skrippy.
-- Setelah ini JANGAN jalankan pnpm db:migrate untuk migrasi yang sama.
-- ===== 0000_initial_schema.sql =====
CREATE TABLE "access_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"code_hint" varchar(8) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"duration_days" integer NOT NULL,
	"check_limit" integer,
	"daily_check_limit" integer NOT NULL,
	"max_redemptions" integer DEFAULT 1 NOT NULL,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"redeem_before" timestamp with time zone NOT NULL,
	"recipient_note" varchar(300),
	"price_idr" integer,
	"payment_method" varchar(20),
	"paid_on" date,
	"payment_note" varchar(500),
	"created_by" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_code_redemptions" CHECK ("access_codes"."redemption_count" <= "access_codes"."max_redemptions")
);

CREATE TABLE "access_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"access_code_id" uuid,
	"kind" varchar(20) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"check_limit" integer,
	"daily_check_limit" integer NOT NULL,
	"checks_used" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_grant_checks_used" CHECK ("access_grants"."check_limit" IS NULL OR "access_grants"."checks_used" <= "access_grants"."check_limit")
);

CREATE TABLE "app_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" varchar(60) NOT NULL,
	"target_type" varchar(40),
	"target_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "check_issues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"check_run_id" uuid NOT NULL,
	"category" varchar(20) NOT NULL,
	"rule_code" varchar(20) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"message" varchar(500) NOT NULL,
	"suggestion" varchar(500),
	"excerpt" text,
	"location" jsonb NOT NULL,
	"fingerprint" varchar(64),
	"user_status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "check_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"access_grant_id" uuid NOT NULL,
	"guideline_snapshot" jsonb NOT NULL,
	"check_types" text[] NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"counts_toward_limit" boolean DEFAULT true NOT NULL,
	"score_total" numeric(5, 1),
	"score_by_category" jsonb,
	"issue_count" integer DEFAULT 0 NOT NULL,
	"engine_version" varchar(40),
	"error_code" varchar(60),
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"thesis_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"original_filename" varchar(300) NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"mime_type" varchar(150) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" varchar(64),
	"page_count" integer,
	"word_count" integer,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "guidelines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"name" varchar(200) NOT NULL,
	"campus_name" varchar(200),
	"version" integer DEFAULT 1 NOT NULL,
	"citation_style" varchar(20) DEFAULT 'apa' NOT NULL,
	"rules" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"full_name" varchar(200),
	"avatar_url" varchar(1000),
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"default_guideline_id" uuid,
	"trial_used" boolean DEFAULT false NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "redeem_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"success" boolean NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "theses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"guideline_id" uuid NOT NULL,
	"title" varchar(300) NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_access_code_id_access_codes_id_fk" FOREIGN KEY ("access_code_id") REFERENCES "public"."access_codes"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "check_issues" ADD CONSTRAINT "check_issues_check_run_id_check_runs_id_fk" FOREIGN KEY ("check_run_id") REFERENCES "public"."check_runs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "check_runs" ADD CONSTRAINT "check_runs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "check_runs" ADD CONSTRAINT "check_runs_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "check_runs" ADD CONSTRAINT "check_runs_access_grant_id_access_grants_id_fk" FOREIGN KEY ("access_grant_id") REFERENCES "public"."access_grants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "documents" ADD CONSTRAINT "documents_thesis_id_theses_id_fk" FOREIGN KEY ("thesis_id") REFERENCES "public"."theses"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "theses" ADD CONSTRAINT "theses_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "theses" ADD CONSTRAINT "theses_guideline_id_guidelines_id_fk" FOREIGN KEY ("guideline_id") REFERENCES "public"."guidelines"("id") ON DELETE no action ON UPDATE no action;
CREATE UNIQUE INDEX "uq_access_codes_hash" ON "access_codes" USING btree ("code_hash");
CREATE INDEX "ix_grants_user_ends" ON "access_grants" USING btree ("user_id","ends_at" DESC NULLS LAST);
CREATE INDEX "ix_issues_run_cat_sev" ON "check_issues" USING btree ("check_run_id","category","severity");
CREATE INDEX "ix_issues_run_fingerprint" ON "check_issues" USING btree ("check_run_id","fingerprint");
CREATE INDEX "ix_check_runs_requester_created" ON "check_runs" USING btree ("requested_by","created_at");
CREATE INDEX "ix_check_runs_document_created" ON "check_runs" USING btree ("document_id","created_at" DESC NULLS LAST);
CREATE INDEX "ix_check_runs_active" ON "check_runs" USING btree ("status","started_at") WHERE "check_runs"."status" IN ('queued','processing');
CREATE UNIQUE INDEX "uq_document_version" ON "documents" USING btree ("thesis_id","version_no");
CREATE UNIQUE INDEX "uq_guideline_name_version" ON "guidelines" USING btree ("name","version");
CREATE INDEX "ix_profiles_email_lower" ON "profiles" USING btree (lower("email"));
CREATE INDEX "ix_redeem_attempts_user_time" ON "redeem_attempts" USING btree ("user_id","attempted_at");
CREATE INDEX "ix_theses_last_activity" ON "theses" USING btree ("last_activity_at");
-- ===== 0001_rls_auth_fk_seed.sql =====
-- profiles.id = auth.users.id (skema auth milik Supabase: hanya direferensikan, tidak diubah)
ALTER TABLE "public"."profiles" ADD CONSTRAINT "fk_profiles_auth_users" FOREIGN KEY ("id") REFERENCES "auth"."users" ("id") ON DELETE CASCADE;

-- RLS aktif di semua tabel public TANPA policy untuk anon dan authenticated:
-- anon key di browser tidak bisa membaca data apa pun. Server memakai koneksi langsung.
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."access_codes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."access_grants" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."guidelines" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."theses" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."check_runs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."check_issues" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."redeem_attempts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;

-- Pedoman bawaan: pedoman umum skripsi Indonesia (idempoten)
INSERT INTO "public"."guidelines" ("id", "name", "version", "citation_style", "rules", "status")
VALUES (gen_random_uuid(), 'Pedoman Umum Skripsi Indonesia', 1, 'apa', $rules${"page": {"size": "A4", "margins_cm": {"left": 4, "top": 4, "right": 3, "bottom": 3}, "margin_tolerance_cm": 0.2}, "body": {"font_family": "Times New Roman", "font_size_pt": 12, "line_spacing": [1.5, 2.0], "first_line_indent_cm": 1.25, "alignment": "justify"}, "chapter_heading": {"pattern": "^BAB [IVX]+$", "uppercase": true, "alignment": "center", "bold": true}, "page_numbering": {"front_matter": "lower_roman", "body": "arabic", "body_starts_at": "BAB I"}, "captions": {"table_position": "above", "figure_position": "below", "numbering": "chapter.sequence"}, "required_sections": ["HALAMAN JUDUL", "LEMBAR PENGESAHAN", "ABSTRAK", "KATA PENGANTAR", "DAFTAR ISI", "BAB I", "BAB II", "BAB III", "BAB IV", "BAB V", "DAFTAR PUSTAKA"], "abstract_words": {"min": 150, "max": 300}, "citation": {"style": "apa", "max_source_age_years": 10, "max_old_source_ratio": 0.3}, "severity_weights": {"critical": 10, "major": 3, "minor": 1}, "disabled_rules": []}$rules$::jsonb, 'published')
ON CONFLICT ("name", "version") DO NOTHING;
-- ===== 0002 (tautan berbagi, rahasia integrasi, status AI, pengingat) =====
CREATE TABLE "integration_secrets" (
	"provider" varchar(40) PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"hint" varchar(20) NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"check_run_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "access_grants" ADD COLUMN "reminder_sent_at" timestamp with time zone;
ALTER TABLE "check_runs" ADD COLUMN "ai_status" varchar(20);
ALTER TABLE "check_runs" ADD COLUMN "ai_note" varchar(160);
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_check_run_id_check_runs_id_fk" FOREIGN KEY ("check_run_id") REFERENCES "public"."check_runs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "uq_share_links_hash" ON "share_links" USING btree ("token_hash");
CREATE INDEX "ix_share_links_run" ON "share_links" USING btree ("check_run_id");
-- ===== 0003 (RLS) =====
-- RLS aktif tanpa policy untuk anon dan authenticated, sama seperti tabel lain.
ALTER TABLE "public"."share_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."integration_secrets" ENABLE ROW LEVEL SECURITY;

-- ===== 0004 (kode akses bisa dilihat lagi oleh admin: kode asli terenkripsi) =====
ALTER TABLE "access_codes" ADD COLUMN IF NOT EXISTS "code_encrypted" text;

-- ===== 0005 (batch kode akses) =====
CREATE TABLE IF NOT EXISTS "code_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"note" varchar(300),
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "access_codes" ADD COLUMN IF NOT EXISTS "batch_id" uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_codes_batch_id_code_batches_id_fk') THEN
    ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_batch_id_code_batches_id_fk"
      FOREIGN KEY ("batch_id") REFERENCES "public"."code_batches"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
ALTER TABLE "public"."code_batches" ENABLE ROW LEVEL SECURITY;
