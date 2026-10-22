-- Skrippy: tambahan skema Fase 2 dan 3.
-- Jalankan SEKALI di Supabase SQL Editor bila database sudah memakai setup.sql sebelumnya.
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
