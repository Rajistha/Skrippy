CREATE TABLE "integration_secrets" (
	"provider" varchar(40) PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"hint" varchar(20) NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "access_grants" ADD COLUMN "reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "check_runs" ADD COLUMN "ai_status" varchar(20);--> statement-breakpoint
ALTER TABLE "check_runs" ADD COLUMN "ai_note" varchar(160);--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_check_run_id_check_runs_id_fk" FOREIGN KEY ("check_run_id") REFERENCES "public"."check_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_share_links_hash" ON "share_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ix_share_links_run" ON "share_links" USING btree ("check_run_id");