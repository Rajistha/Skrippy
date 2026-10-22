# Skrippy

<div align="center">

**Aplikasi Web Pemeriksa Naskah Skripsi & Karya Ilmiah Otomatis**  
*Format rapi, struktur lengkap, ejaan tepat, dan sitasi valid sebelum bimbingan atau sidang.*

[![Next.js](https://img.shields.io/badge/Next.js-16_App_Router-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9_Strict-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth_%26_Storage_%26_Postgres-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-PostgreSQL-C5F74F?style=for-the-badge&logo=drizzle)](https://orm.drizzle.team/)
[![Vitest](https://img.shields.io/badge/Vitest-150%2B_Tests_Passing-6E9F18?style=for-the-badge&logo=vitest)](https://vitest.dev/)

[Ringkasan](#ringkasan) •
[Fitur Pemeriksaan](#fitur-pemeriksaan) •
[Fitur Lanjutan](#fitur-lanjutan) •
[Tech Stack](#tech-stack) •
[Instalasi & Menjalankan Lokal](#instalasi--menjalankan-lokal) •
[Struktur Repositori](#struktur-repositori) •
[Pengujian](#pengujian--kualitas-kode) •
[Privasi & Keamanan](#privasi--keamanan-data)

</div>

---

## Ringkasan

Mahasiswa tingkat akhir sering menghabiskan waktu revisi bukan karena substansi penelitian, melainkan akibat kendala format teknis: **margin tidak presisi, spasi tidak konsisten, penomoran halaman romawi vs arab tertukar, ejaan tidak baku KBBI, serta ketidaksesuaian antara kutipan naskah dan daftar pustaka**.

**Skrippy** menyelesaikan masalah ini dengan membaca berkas `.docx` langsung ke memori (parsing OpenXML OOXML murni), memvalidasi ratusan aturan pedoman penulisan skripsi kampus Indonesia, dan menyajikan laporan temuan interaktif beserta bab, paragraf, perkiraan nomor halaman, dan rekomendasi perbaikan siap salin dalam waktu kurang dari 30 detik.

> [!NOTE]
> **Arsitektur Serverless & Ringan:**  
> Seluruh sistem berjalan di atas Vercel Function dan Supabase. Tidak membutuhkan VPS mandiri, Celery, Redis, LibreOffice, atau Docker container runtime. Mesin pemeriksa beroperasi secara deterministik dan hemat memori.

---

## Fitur Pemeriksaan

```
                              +-------------------------+
                              |    Dokumen Mahasiswa    |
                              |         (.docx)         |
                              +------------+------------+
                                           | Upload
                                           v
+----------------------------------------------------------------------------------+
|                             MESIN PEMERIKSA SKRIPPY                              |
+-------------------+-------------------+-------------------+----------------------+
|   FORMAT (FMT)    |  STRUKTUR (STR)   |    EJAAN (EJA)    |     SITASI (SIT)     |
+-------------------+-------------------+-------------------+----------------------+
| * Margin 4-4-3-3  | * Hierarki Bab    | * Kamus KBBI      | * Cross-check Kutipan|
| * Font & Ukuran   | * Subbab (1.1.1)  | * Kata Baku/Typo  |   vs Daftar Pustaka  |
| * Spasi (1.5/2.0) | * Lembar Pengesah | * Kata Depan di/ke| * Format APA/IEEE    |
| * Nomor Romawi/Arb| * Abstrak ID & EN | * Istilah Asing   | * Sumber Menggantung |
| * Posisi Nomor Hlm| * Daftar Pustaka  | * Spasi Tanda Baca| * Konsistensi Tahun  |
+-------------------+-------------------+-------------------+----------------------+
                                           |
                                           v
                              +-------------------------+
                              |   Laporan Interaktif    |
                              |   + Saran Perbaikan     |
                              +-------------------------+
```

### 1. Pemeriksaan Format (FMT)
- **Margin & Kertas**: Validasi batas margin (Kiri 4 cm, Atas 4 cm, Kanan 3 cm, Bawah 3 cm atau kustom pedoman kampus) dan ukuran kertas standar A4.
- **Tipografi Efektif**: Menyelesaikan rantai gaya Word (`basedOn`, `docDefaults`), memastikan font utama (Times New Roman, Arial, dsb.) dan ukuran font judul/isi seragam.
- **Spasi & Indentasi**: Deteksi line spacing (1.0, 1.15, 1.5, 2.0), spasi antar-paragraf (`before/after`), serta perataan justified.
- **Penomoran Halaman Kompleks**: Menangani pergantian seksi (*section break*) antara halaman awal berangka Romawi kecil (`i, ii, iii`) di bagian bawah-tengah, dan halaman isi berangka Arab (`1, 2, 3`) di sudut kanan-atas.

### 2. Sistematika & Struktur Bab (STR)
- **Kelengkapan Dokumen**: Verifikasi keberadaan Bab I s.d. Bab V, Lembar Pengesahan, Kata Pengantar, Pernyataan Keaslian, Abstrak (Bahasa Indonesia & Inggris), Daftar Isi, Daftar Tabel, Daftar Gambar, dan Lampiran.
- **Penomoran Subbab Bertingkat**: Validasi hierarki penomoran (`1.1`, `1.1.1`, `2.3.1`) agar tidak melompat atau tidak beraturan.
- **Deteksi Heading Otomatis & Manual**: Mengenali judul bab dan subbab baik yang menggunakan fitur Word Heading Styles maupun yang diformat secara manual.

### 3. Ejaan & Kaidah Kebahasaan (EJA)
- **Kamus KBBI Bawaan**: Mendeteksi ratusan kata tidak baku yang umum dalam naskah ilmiah (misal: *analisa* -> *analisis*, *praktek* -> *praktik*, *metodologi* vs *metode*).
- **Kata Depan & Awalan**: Validasi penulisan kata depan *di/ke* yang dipisah (*di mana*, *ke kampus*) vs awalan yang disambung (*dilakukan*, *dikembangkan*).
- **Format Istilah Asing**: Memeriksa penulisan huruf miring (*italic*) pada kata atau frasa asing yang belum diserap ke dalam Bahasa Indonesia.
- **Tipografi Tanda Baca**: Mengoreksi spasi sebelum tanda baca titik/koma dan spasi ganda yang tidak disengaja.

### 4. Konsistensi Sitasi & Referensi (SIT)
- **Pencocokan Silang (Cross-Referencing)**: Memeriksa setiap kutipan (nama penulis dan tahun) di dalam naskah terhadap entri di Daftar Pustaka.
  - *Kutipan tanpa Daftar Pustaka*: Sitasi muncul di dalam teks namun tidak tercatat di Daftar Pustaka.
  - *Daftar Pustaka Menggantung*: Entri tercantum di Daftar Pustaka namun tidak pernah disitir di dalam badan teks.
- **Standar Format Sitasi**: Mendukung deteksi gaya sitasi akademik umum seperti APA, Harvard, dan IEEE.

---

## Fitur Lanjutan

| Modul | Deskripsi |
|---|---|
| **Perbandingan Versi (Diff)** | Membandingkan progres naskah antar versi (v1, v2, v3), melacak kenaikan skor, dan menampilkan temuan yang sudah berhasil diperbaiki. |
| **Tautan Berbagi Baca-Saja** | Menghasilkan tautan publik dengan token aman agar dosen pembimbing atau rekan dapat meninjau laporan temuan tanpa perlu login. |
| **Naskah Beranotasi** | Ekspor naskah DOCX atau ringkasan PDF yang menandai kalimat bermasalah dengan warna tingkat keparahan temuan. |
| **Review Semantik AI (Opsional)** | Integrasi opsional dengan penyedia AI untuk memeriksa nada bahasa ilmiah dan koherensi abstrak. Kunci API tersimpan terenkripsi AES-GCM. |
| **Ekstraksi Pedoman Kampus** | Unggah berkas pedoman kampus (PDF/DOCX); parser mengekstrak konfigurasi aturan deterministik untuk disimpan sebagai profil pedoman kampus. |

---

## Tech Stack

### Frontend & Antarmuka
- **Next.js 16 (App Router)**: Server Components secara default, Route Handlers terisolasi, TypeScript strict.
- **React 19**: Rendering antarmuka modern dengan komponen interaktif modular.
- **Tailwind CSS v4**: Desain berbasis token visual terpusat, responsif hingga resolusi 360 px, dan bebas emoji (simbol Unicode & Lucide SVG).

### Database, Autentikasi & Penyimpanan
- **Supabase PostgreSQL**: Database relasional dengan Row Level Security (RLS) aktif penuh di skema `public`.
- **Drizzle ORM & drizzle-kit**: Type-safe query builder dan migrasi skema SQL terstruktur.
- **Supabase Auth**: Autentikasi berbasis Google SSO dan Email lewat `@supabase/ssr`.
- **Supabase Storage**: Bucket privat dengan URL bertanda tangan (*signed URL*) berbatas kedaluwarsa 10 menit.

### Pengolahan Dokumen & Validasi
- **fflate**: Unzip arsip OpenXML dengan perlindungan *zip-bomb* (kuota dekompresi maks 200 MB).
- **fast-xml-parser**: XML parser aman tanpa pemrosesan external entity atau DTD.
- **unpdf**: Ekstraksi teks PDF buku pedoman kampus tanpa dependensi native biner.
- **Zod**: Validasi skema input/output di client dan server.

### Pengujian & Penjaminan Mutu
- **Vitest & Testing Library**: Pengujian unit dan integrasi (150+ tes lolos).
- **Playwright**: Pengujian end-to-end untuk alur penukaran kode, unggah, dan pemeriksaan laporan.

---

## Instalasi & Menjalankan Lokal

### 1. Prasyarat
- **Node.js** v20 atau lebih baru (v24 direkomendasikan)
- **pnpm** v9 atau lebih baru
- Akun atau instans lokal **Supabase**

### 2. Kloning Repositori & Instalasi
```bash
git clone https://github.com/username/skrippy.git
cd skrippy
pnpm install
```

### 3. Konfigurasi Lingkungan (.env.local)
Salin berkas template dan atur nilainya:

```bash
cp .env.example .env.local
```

Variabel yang diperlukan:
```env
# Database Supabase (Pooler Transaction Mode)
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:6543/postgres?pgbouncer=true

# Klien Supabase Server (Service Role untuk Storage & Admin)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJh...
SUPABASE_STORAGE_BUCKET=manuscripts

# Kriptografi & Keamanan
ACCESS_CODE_HMAC_SECRET=kunci-rahasia-hmac-minimal-32-karakter
CRON_SECRET=rahasia-pemanggilan-job-maintenance
SUPERADMIN_EMAIL=admin@skrippy.id

# Konfigurasi Aplikasi
APP_BASE_URL=http://localhost:3000
FILE_RETENTION_DAYS=30
MAX_UPLOAD_MB=25

# Variabel Publik Browser
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...
```

### 4. Migrasi Skema Database
```bash
pnpm db:migrate
```

### 5. Menjalankan Server Development
```bash
pnpm dev
```
Aplikasi dapat diakses melalui [http://localhost:3000](http://localhost:3000).

---

## Struktur Repositori

```
skrippy/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (landing)/            # Landing page publik (/)
│   │   ├── (auth)/               # Halaman masuk (/masuk) & daftar (/daftar)
│   │   ├── (app)/                # Area autentikasi mahasiswa
│   │   │   ├── dashboard/        # Beranda & status akses
│   │   │   ├── skripsi/          # Pengelolaan naskah & riwayat versi
│   │   │   ├── laporan/[id]/     # Laporan temuan interaktif
│   │   │   ├── profil/           # Info akun & penukaran kode
│   │   │   └── admin/            # Panel Superadmin (Kode, Pengguna, Pengaturan, Pedoman)
│   │   └── api/                  # Route Handlers API (RESTful)
│   ├── components/
│   │   ├── ui/                   # Komponen dasar (Button, Card, Badge, Modal, Input, dll.)
│   │   ├── features/             # Komponen fitur (AppShell, UploadFlow, GuidelineEditor, dll.)
│   │   └── landing/              # Komponen landing page
│   ├── lib/
│   │   ├── api/                  # Klien pemanggil API bertipe
│   │   ├── supabase/             # Inisialisasi klien Supabase browser & server
│   │   └── i18n/id.ts            # Kamus teks antarmuka terpusat (Bahasa Indonesia)
│   ├── server/                   # Modul khusus server ('server-only')
│   │   ├── db/                   # Skema Drizzle ORM, koneksi pooler, dan transaksi
│   │   ├── checkers/             # Mesin pemeriksa deterministik (tanpa I/O)
│   │   │   ├── parse/            # Parser .docx OOXML (document, styles, xml, zip)
│   │   │   ├── format/           # Aturan FMT-001 s.d. FMT-011
│   │   │   ├── structure/        # Aturan STR-001 s.d. STR-009
│   │   │   ├── spelling/         # Aturan EJA-001 s.d. EJA-007 + Kamus KBBI
│   │   │   ├── citation/         # Aturan SIT-001 s.d. SIT-006 + Ekstraktor Sitasi
│   │   │   ├── registry.ts       # Registry seluruh aturan aktif
│   │   │   └── scoring.ts        # Kalkulator skor kepatuhan dokumen (0 - 100)
│   │   └── services/             # Logika bisnis (access, theses, checks, guidelines, admin)
│   └── styles/
│       └── tokens.css            # Token desain: warna, radius, bayangan, font
├── drizzle/                      # Berkas migrasi SQL Drizzle Kit
├── tests/
│   ├── fixtures/                 # Generator naskah sintetis otomatis
│   └── helpers/                  # Test database & mock stubs
├── docs/                         # PRD.md, ERD.md, DESIGN.md, AGENTS.md
└── package.json
```

---

## Pengujian & Kualitas Kode

```bash
# Menjalankan seluruh pengujian unit dan integrasi
pnpm test

# Menjalankan pengujian berurutan (hemat memori)
pnpm vitest run --no-file-parallelism

# Validasi static typing
pnpm typecheck

# Linter ESLint
pnpm lint

# Pengujian End-to-End dengan Playwright
pnpm e2e
```

> [!TIP]
> **Kebijakan Fixture Dokumen:**  
> Seluruh naskah uji `.docx` dibangun secara programatik menggunakan pustaka `docx` di `tests/fixtures/build-fixtures.ts`. Repositori tidak pernah menyimpan atau memuat naskah asli mahasiswa.

---

## Privasi & Keamanan Data

- **Penyimpanan Berkas Privat**: Dokumen `.docx` hanya disimpan di bucket privat Supabase dan hanya dapat diakses melalui signed URL berumur maksimal 10 menit.
- **Nol Logging Isi Naskah**: Potongan teks atau isi naskah mahasiswa tidak pernah dicatat di log server, konsol terminal, maupun tracking error.
- **Batas Cuplikan Temuan**: Panjang kutipan teks pada tabel temuan dibatasi maksimal 300 karakter untuk menjaga kerahasiaan isi karya ilmiah.
- **Enkripsi Kunci & Kode**: Kode akses diverifikasi melalui hash HMAC-SHA256, dan kunci integrasi pihak ketiga disimpan dengan enkripsi AES-GCM.
- **Siklus Retensi Otomatis**: Job pemeliharaan berkala menghapus berkas naskah dan riwayat pemeriksaan yang melampaui batas waktu `FILE_RETENTION_DAYS` (30 hari).

---

## Lisensi

Dikembangkan sebagai alat bantu penulisan karya ilmiah mahasiswa Indonesia yang presisi dan terstandarisasi. Hak cipta dilindungi undang-undang.
