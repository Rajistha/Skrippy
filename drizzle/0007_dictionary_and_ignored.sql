CREATE TABLE "dictionary_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" varchar(20) NOT NULL,
	"term" varchar(80) NOT NULL,
	"replacement" varchar(80),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ignored_findings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"rule_code" varchar(20) NOT NULL,
	"text" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ignored_findings" ADD CONSTRAINT "ignored_findings_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_dictionary_kind_term" ON "dictionary_entries" USING btree ("kind","term");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ignored_user_rule_text" ON "ignored_findings" USING btree ("user_id","rule_code","text");
--> statement-breakpoint
ALTER TABLE "public"."dictionary_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."ignored_findings" ENABLE ROW LEVEL SECURITY;
