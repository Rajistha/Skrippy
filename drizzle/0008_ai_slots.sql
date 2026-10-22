CREATE TABLE "ai_slots" (
	"key" varchar(40) PRIMARY KEY NOT NULL,
	"holder" uuid NOT NULL,
	"locked_until" timestamp with time zone NOT NULL
);

--> statement-breakpoint
ALTER TABLE "public"."ai_slots" ENABLE ROW LEVEL SECURITY;
