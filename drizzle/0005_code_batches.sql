CREATE TABLE "code_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"note" varchar(300),
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_codes" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "access_codes" ADD CONSTRAINT "access_codes_batch_id_code_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."code_batches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "public"."code_batches" ENABLE ROW LEVEL SECURITY;
