-- RLS aktif tanpa policy untuk anon dan authenticated, sama seperti tabel lain.
ALTER TABLE "public"."share_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."integration_secrets" ENABLE ROW LEVEL SECURITY;
