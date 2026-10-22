-- profiles.id = auth.users.id (skema auth milik Supabase: hanya direferensikan, tidak diubah)
ALTER TABLE "public"."profiles" ADD CONSTRAINT "fk_profiles_auth_users" FOREIGN KEY ("id") REFERENCES "auth"."users" ("id") ON DELETE CASCADE;
--> statement-breakpoint
-- RLS aktif di semua tabel public TANPA policy untuk anon dan authenticated:
-- anon key di browser tidak bisa membaca data apa pun. Server memakai koneksi langsung.
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."access_codes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."access_grants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."guidelines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."theses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."check_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."check_issues" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."redeem_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Pedoman bawaan: pedoman umum skripsi Indonesia (idempoten)
INSERT INTO "public"."guidelines" ("id", "name", "version", "citation_style", "rules", "status")
VALUES (gen_random_uuid(), 'Pedoman Umum Skripsi Indonesia', 1, 'apa', $rules${"page": {"size": "A4", "margins_cm": {"left": 4, "top": 4, "right": 3, "bottom": 3}, "margin_tolerance_cm": 0.2}, "body": {"font_family": "Times New Roman", "font_size_pt": 12, "line_spacing": [1.5, 2.0], "first_line_indent_cm": 1.25, "alignment": "justify"}, "chapter_heading": {"pattern": "^BAB [IVX]+$", "uppercase": true, "alignment": "center", "bold": true}, "page_numbering": {"front_matter": "lower_roman", "body": "arabic", "body_starts_at": "BAB I"}, "captions": {"table_position": "above", "figure_position": "below", "numbering": "chapter.sequence"}, "required_sections": ["HALAMAN JUDUL", "LEMBAR PENGESAHAN", "ABSTRAK", "KATA PENGANTAR", "DAFTAR ISI", "BAB I", "BAB II", "BAB III", "BAB IV", "BAB V", "DAFTAR PUSTAKA"], "abstract_words": {"min": 150, "max": 300}, "citation": {"style": "apa", "max_source_age_years": 10, "max_old_source_ratio": 0.3}, "severity_weights": {"critical": 10, "major": 3, "minor": 1}, "disabled_rules": []}$rules$::jsonb, 'published')
ON CONFLICT ("name", "version") DO NOTHING;
