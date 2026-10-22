# AGENTS.md

Panduan untuk agen AI pemrograman (dan developer manusia) yang bekerja di repositori ini. Baca seluruh file ini sebelum mengubah kode. Untuk konteks produk lihat `docs/PRD.md`, untuk skema data `docs/ERD.md`, untuk tampilan `docs/DESIGN.md`.

## Ringkasan proyek

Skrippy adalah aplikasi web pemeriksa naskah skripsi. Mahasiswa mengunggah .docx, sistem memeriksa format, struktur, ejaan, dan sitasi berdasarkan pedoman kampus (konfigurasi JSON), lalu menyimpan temuan untuk ditampilkan sebagai laporan.

Pendaftaran **terbuka** (email + kata sandi, atau Google). **Trial adalah saklar** (`trial.enabled` di Pengaturan, bukan jenis kode). Menyala: akun baru, dan akun lama yang belum pernah punya akses, otomatis mendapat trial (durasi dan batas dari `app_settings`, sekali per akun). Mati: akun baru masuk tanpa akses dan semua halaman selain Profil terkunci (`AccessGate`) sampai menukar **kode paket** yang dibuat pemilik di panel admin. Kode akses hanya untuk paket; catatan pembayaran bersifat opsional. Tidak ada payment gateway. Pembayaran terjadi di luar aplikasi (WhatsApp) dan hanya dicatat sebagai catatan pada kode paket. Skala target puluhan pengguna.

**Tanpa server sendiri.** Seluruh aplikasi berjalan di Vercel (Next.js) dan Supabase (Postgres, Auth, Storage). Tidak ada VPS, Docker, Celery, Redis, atau LibreOffice. Semua pemeriksaan berjalan di dalam Vercel Function.

**Catatan hosting.** Vercel Hobby hanya untuk penggunaan non-komersial, dan penjualan kode paket bisa dianggap komersial. Selama belum ada kode paket berbayar yang dijual, tidak ada masalah. **Jangan menambah fitur pembayaran, iklan, atau pemrosesan uang di dalam aplikasi.** Keputusan hosting sebelum penjualan pertama ada di `docs/PRD.md` bagian 13. Karena itu semua logika pemeriksaan ditulis sebagai fungsi murni yang tidak bergantung pada Vercel, agar mudah dipindah.

**Fase saat ini: Fase 1 sampai 3.** Fase 2 (perbandingan versi, tautan berbagi, PDF dan docx naskah bersorot, pengingat email) dan Fase 3 (analisis AI) sudah ada. **AI selalu opsional**: tanpa kunci API yang dihubungkan admin, seluruh aplikasi tetap berjalan dan pengguna melihat "AI belum bisa digunakan". Aturan AI:
- Semua pemanggilan ke penyedia AI lewat `integrations/ai.ts` (`AiClient`), tanpa SDK, hanya `fetch`. Pemeriksa AI (`checkers/ai/prompts.ts`) murni; pemanggilan dan batas waktu di `services/ai-check.ts`.
- Kunci API disimpan terenkripsi (`integration_secrets`, AES-GCM) dan tidak pernah dikembalikan ke browser; hanya 4 karakter terakhir.
- Jawaban model tidak dipercaya: temuan harus menunjuk paragraf yang ada dan mengutip teks yang benar-benar ada di paragraf itu, selain itu dibuang.
- Kegagalan AI tidak boleh menggagalkan cek aturan. Cek ber-AI hanya bila pengguna mencentang opsinya, dan teks naskah yang dikirim tidak pernah di-log.
- Kuota AI per hari kalender WIB (`ai.daily_limit`), bawaan khusus paket (`ai.allow_trial`).

## Stack

| Bagian | Teknologi |
|---|---|
| Aplikasi | Next.js (App Router), TypeScript strict, Tailwind CSS, satu proyek untuk UI dan API (Route Handlers) |
| Autentikasi | Supabase Auth, hanya provider Google, lewat `@supabase/ssr` |
| Database | PostgreSQL di Supabase, diakses dari server lewat Drizzle ORM dan connection string pooler (mode transaction, prepared statements dimatikan) |
| Migrasi | drizzle-kit (SQL), ditambah migrasi SQL kustom untuk RLS |
| Storage | Supabase Storage (bucket privat) |
| Pengolahan dokumen | `fflate` (unzip dengan filter dan batas ukuran), `fast-xml-parser` (OOXML), `unpdf` (teks PDF buku pedoman, JS murni) |
| Validasi | zod, dipakai bersama oleh client dan server |
| Ikon | `lucide-react` (SVG), lewat komponen `Icon` |
| Tes | Vitest, Playwright |
| Lint dan format | ESLint, Prettier, `tsc --noEmit` |
| Deploy | Vercel (tier gratis selama belum ada penjualan), Supabase tier gratis, job harian lewat GitHub Actions |

Batas yang harus diingat: Vercel Function maksimal 300 detik dan 2 GB memori, isi request maksimal 4,5 MB (naskah tidak boleh lewat function). Supabase gratis: database 500 MB, storage 1 GB, egress 5 GB per bulan, dan proyek ditidurkan setelah seminggu tanpa aktivitas.

## Struktur repositori

Satu proyek Next.js, bukan monorepo dengan banyak paket.

```
/
├── src/
│   ├── app/                  # route: (landing), (auth), (dashboard), (admin), api/
│   │   └── api/              # Route Handlers, tipis
│   ├── components/           # ui/ (primitif), features/ (per fitur)
│   ├── lib/
│   │   ├── supabase/         # klien browser dan server, hanya untuk auth
│   │   ├── api/              # pemanggil API bertipe untuk client
│   │   └── i18n/id.ts        # semua teks UI
│   ├── server/               # kode yang hanya jalan di server
│   │   ├── db/               # schema Drizzle, klien, transaksi
│   │   ├── services/         # logika bisnis: access, theses, checks, guidelines, admin
│   │   ├── checkers/         # mesin pemeriksaan, murni, tanpa I/O
│   │   │   ├── types.ts              # Checker, Issue, Location, ParsedDocument
│   │   │   ├── parse/                # parser .docx ke ParsedDocument (gaya efektif, section, footer)
│   │   │   ├── format/               # aturan FMT-xxx
│   │   │   ├── structure/            # aturan STR-xxx
│   │   │   ├── spelling/             # aturan EJA-xxx + data kamus
│   │   │   ├── citation/             # aturan SIT-xxx
│   │   │   ├── defaults.json
│   │   │   └── registry.ts
│   │   └── integrations/     # storage.ts (signed URL, unduh file)
│   └── styles/               # tokens.css sesuai DESIGN.md
├── drizzle/                  # migrasi SQL hasil drizzle-kit
├── supabase/                 # config.toml untuk Supabase lokal
├── tests/
│   ├── fixtures/             # build-fixtures.ts, naskah sintetis, BUKAN naskah asli mahasiswa
│   └── e2e/
├── docs/                     # PRD.md, ERD.md, DESIGN.md
├── .github/workflows/        # maintenance.yml (job harian)
└── AGENTS.md
```

## Perintah

```bash
# Supabase lokal (Postgres, Auth, Storage)
supabase start

# Aplikasi
pnpm install
pnpm dev
pnpm db:generate     # buat migrasi dari perubahan schema
pnpm db:migrate      # terapkan migrasi
pnpm test            # Vitest
pnpm lint
pnpm typecheck
pnpm e2e             # Playwright
```

Sebelum menyatakan pekerjaan selesai, jalankan lint, typecheck, dan tes untuk bagian yang diubah. Semua harus lolos.

## Aturan arsitektur

1. **Browser memakai Supabase hanya untuk login.** Supabase JS di browser dipakai untuk masuk dengan Google, keluar, dan menjaga sesi. Browser tidak pernah membaca atau menulis tabel atau storage Supabase secara langsung, kecuali mengunggah file ke signed upload URL yang diberikan server. Semua data lewat Route Handlers.
2. **RLS aktif di semua tabel `public` tanpa policy untuk `anon` dan `authenticated`**, sehingga anon key yang ada di browser tidak bisa membaca data apa pun. Server terhubung langsung ke Postgres dan memakai service role key hanya untuk Storage dan Admin API. **Service role key tidak pernah boleh berawalan `NEXT_PUBLIC_`.**
3. **Migrasi hanya mengelola skema `public`.** Jangan membuat migrasi yang mengubah skema `auth` atau `storage` milik Supabase.
4. **Route Handler tipis.** Hanya validasi input (zod), memanggil service, dan mengembalikan respons. Logika bisnis di `src/server/services/`.
5. **Checker murni.** Modul di `src/server/checkers/` menerima `ParsedDocument` dan `rules`, mengembalikan daftar `Issue`. Tidak boleh mengakses database, jaringan, storage, `process.env`, atau API khusus Vercel. Ini membuat checker mudah diuji dan mudah dipindah ke hosting lain.
6. **Pemeriksaan tanpa antrean.** Alurnya: browser mengunggah ke Storage lewat signed URL, memanggil API membuat `check_run`, function mengunduh file, mem-parse, menjalankan checker, menyimpan `check_issues`, lalu memperbarui status. Browser polling status. Route Handler pemeriksaan mengatur `export const maxDuration = 300` dan `runtime = 'nodejs'`. Detail di `docs/ERD.md` bagian "Pemeriksaan tanpa antrean".
7. **Pedoman adalah data.** Admin menambah pedoman lewat `/admin/pedoman`: unggah PDF atau .docx, `checkers/guideline-extract.ts` (deterministik, tanpa AI) mengusulkan nilai dengan kutipan sumber, admin meninjau lalu menerbitkan. Pedoman terbit tidak diubah di tempat; perubahan menjadi versi baru. Jangan menulis nilai pedoman (margin, font, dan sebagainya) di kode. Ambil dari `rules`. Default ada di `checkers/defaults.json` dan hanya dipakai untuk mengisi kunci yang tidak ada.
8. **Gunakan snapshot.** Checker membaca `check_runs.guideline_snapshot`, bukan tabel `guidelines` yang mungkin sudah berubah.
9. **Parser hemat memori.** Hanya baca `word/document.xml`, `word/styles.xml`, `word/numbering.xml`, `word/settings.xml`, dan file footer atau header. Jangan mengekstrak folder `word/media`.

## Parser dan keterbatasan halaman

Tidak ada LibreOffice, jadi halaman tidak dirender. Aturannya:

- Penomoran halaman (FMT-009) diperiksa dari struktur: `w:sectPr`, `w:pgNumType` (format dan `w:start`), dan keberadaan field `PAGE` di footer tiap section.
- `Location.page` berisi perkiraan dari penanda `w:lastRenderedPageBreak` bila ada (ditulis Word saat menyimpan). Bila tidak ada, `page` bernilai `null` dan UI tidak menampilkan halaman. Jangan menebak halaman dengan perhitungan karakter.
- Gaya efektif (font, ukuran, spasi, indentasi, perataan) harus diselesaikan dari `docDefaults`, rantai `basedOn` pada styles, gaya paragraf, dan format run. Ini bagian tersulit parser, beri tes khusus.
- Heading dideteksi lewat style Word dan pola teks ("BAB I"), karena banyak naskah memakai format manual.

## Menambah pemeriksa (aturan baru)

1. Pilih kategori dan kode berikutnya (misal `FMT-012`). Tambahkan ke tabel aturan di `docs/PRD.md` bagian 8.
2. Buat modul di folder kategori yang mengimplementasikan:

```ts
export interface Checker {
  code: string;                       // "FMT-012"
  category: 'format' | 'structure' | 'spelling' | 'citation';
  defaultSeverity: 'critical' | 'major' | 'minor';
  run(doc: ParsedDocument, rules: Rules): Issue[];
}
```

3. Daftarkan di `registry.ts`.
4. Tambah konfigurasi di `defaults.json` bila aturan butuh parameter.
5. Tulis tes dengan minimal satu fixture yang melanggar dan satu yang lolos.
6. Pesan temuan dan saran dalam Bahasa Indonesia, singkat, menyebut nilai aktual dan nilai seharusnya. Contoh: "Margin kiri 3 cm, seharusnya 4 cm." Lihat gaya bahasa di `docs/DESIGN.md` bagian 11.

Pemeriksa AI di Fase 3 akan mengikuti antarmuka yang sama (dengan `run` async), jadi **jangan mengubah bentuk `Issue` atau `Location` tanpa alasan kuat**.

## Autentikasi (wajib dipatuhi)

- Login lewat Supabase Auth: Google, atau email + kata sandi (provider Email Supabase, minimal 8 karakter). Pendaftaran dan kata sandi ditangani penuh oleh Supabase dari browser; API tidak punya endpoint daftar atau kata sandi sendiri. Aktifkan konfirmasi email di Supabase agar trial tidak bisa diambil berulang dengan email palsu.
- Di server, identitas pengguna diambil dengan `supabase.auth.getUser()`, **bukan `getSession()`**, karena `getUser()` memverifikasi token ke server Auth. Jangan memercayai klaim dari cookie tanpa verifikasi.
- Helper `requireProfile()` mengembalikan profil. Bila pengguna login tapi profil belum ada, profil dan grant trial dibuat otomatis (`ensureUserProfile`, idempoten dan aman untuk permintaan bersamaan).
- Helper `requireAdmin()` untuk semua `/api/admin/*`. Pengecekan peran dilakukan di server, bukan hanya menyembunyikan menu di UI.
- Profil dibuat di dalam transaksi penukaran kode pertama, mengambil email, nama, dan avatar dari data pengguna Supabase.
- Akun dengan email sama dengan `SUPERADMIN_EMAIL` mendapat profil `superadmin` otomatis saat pertama masuk.
- Job harian menghapus akun `auth.users` tanpa profil yang berumur lebih dari 7 hari, lewat Supabase Admin API.

## Kode akses dan hak akses (wajib dipatuhi)

Logika lengkap ada di `docs/ERD.md` bagian "Logika akses". Ringkasnya:

- **Semua logika akses ada di `src/server/services/access.ts`.** Route Handler dan modul lain tidak menghitung sendiri apakah pengguna boleh menjalankan cek. Panggil `ensureCanRunCheck(profile)`.
- **Kode akses asli tidak pernah disimpan sebagai teks biasa dan tidak pernah di-log.** Untuk pencarian saat penukaran disimpan hash (HMAC-SHA256 dengan `ACCESS_CODE_HMAC_SECRET`) dan 4 karakter terakhir. Agar admin bisa melihat kode kapan saja, salinannya disimpan **terenkripsi** (AES-GCM, `access_codes.code_encrypted`) dan hanya didekripsi di `GET /api/admin/batches/[id]` (khusus admin, `Cache-Control: no-store`). Daftar batch tidak memuat kode. Kode lama tanpa salinan terenkripsi hanya tampil 4 karakter terakhir. Mengganti `ACCESS_CODE_HMAC_SECRET` membuat kode terenkripsi tidak bisa dibuka dan hash tidak cocok.
- **Kode dikelompokkan dalam batch** (`code_batches`, nomor urut tampilan). Satu kode bisa dipakai beberapa orang (`max_redemptions`), tetapi tidak dua kali oleh orang yang sama. "Cabut" kode atau batch = hapus permanen dan mencabut akses yang berasal darinya (`access_grants.revoked_at`, `accessCodeId` dikosongkan); riwayat cek tetap ada.
- Pembangkitan kode memakai `crypto.randomInt` atau `crypto.randomBytes`, alfabet tanpa karakter mirip (tanpa O, 0, I, 1, L), format `SKR-XXXX-XXXX`.
- Input kode dinormalisasi sebelum di-hash: huruf kapital, buang spasi dan tanda hubung, tambahkan kembali prefiks.
- Penukaran kode dan pembuatan `check_run` masing-masing terjadi dalam **satu transaksi** dengan `SELECT ... FOR UPDATE` pada baris yang relevan, agar dua permintaan bersamaan tidak memakai jatah atau kode yang sama dua kali.
- Pesan error penukaran kode sama untuk semua kegagalan ("Kode tidak valid atau sudah tidak berlaku"), kecuali kasus trial kedua yang boleh dijelaskan.
- Rate limit penukaran kode: 5 percobaan per 15 menit per akun. Karena tidak ada Redis, simpan hitungan percobaan di tabel database (kolom atau tabel kecil `redeem_attempts`).
- Kode hanya memberi **masa akses** (durasi disalin ke kode saat dibuat). **Batas cek (harian paket, jatah dan harian trial) mengikuti `app_settings`**: dipakai saat grant dibuat, dan `updateSettings` memperbarui grant yang masih aktif (bukan admin) saat nilainya diubah.
- Perpanjangan paket menambah durasi ke `ends_at` paket aktif, bukan dari hari ini.
- Cek yang gagal karena kesalahan sistem tidak dihitung ke jatah (`counts_toward_limit = false`, kurangi `checks_used`).
- Batas harian dihitung per hari kalender WIB (Asia/Jakarta).
- Setiap tindakan admin terhadap kode, akses, dan pengaturan menulis `audit_logs`.

## Job harian

Satu workflow GitHub Actions (`.github/workflows/maintenance.yml`) memanggil `POST /api/internal/maintenance` setiap hari dengan header `Authorization: Bearer <CRON_SECRET>`. Endpoint memverifikasi secret dengan perbandingan waktu-konstan dan tidak punya jalur lain. Tugasnya:

1. Ping database agar proyek Supabase tidak ditidurkan.
2. Hapus naskah yang tidak aktif lebih dari `FILE_RETENTION_DAYS` (default 30), baik file di Storage maupun baris terkait (lihat aturan penghapusan di `docs/ERD.md`).
3. Hapus akun `auth.users` tanpa profil yang berumur lebih dari 7 hari.
4. Tandai `check_runs` berstatus `processing` lebih dari 10 menit sebagai `failed` (error_code `timeout`) dan kembalikan jatahnya.
5. Hapus signed link atau laporan yang sudah kedaluwarsa (Fase 2).

Setiap tugas harus idempoten dan aman dijalankan ulang.

## Privasi dan keamanan (wajib dipatuhi)

- **Jangan pernah me-log isi naskah**, termasuk potongan teks, di `console`, pesan error, atau alat pelacak error. Log hanya ID, ukuran, durasi, dan kode error.
- `check_issues.excerpt` maksimal 300 karakter.
- File di storage hanya bisa diakses lewat signed URL berumur maksimal 10 menit. Bucket selalu privat.
- Validasi file di server: ekstensi, magic bytes ZIP, keberadaan `word/document.xml`, ukuran maksimal 25 MB. Cegah zip bomb dengan menolak arsip yang total ukuran setelah dekompresi lebih dari 200 MB, memakai filter `fflate` yang membaca ukuran asli sebelum mengekstrak. Tolak file terenkripsi.
- Parse XML dengan konfigurasi yang tidak memproses entitas eksternal atau DTD.
- Setiap Route Handler yang mengakses skripsi, dokumen, atau laporan wajib memeriksa kepemilikan atau hak akses (pemilik data atau superadmin; untuk tautan berbagi di Fase 2, token yang valid dan belum dicabut). Tulis tes untuk akses lintas pengguna.
- Rate limit: penukaran kode dan pembuatan cek (login dibatasi oleh Supabase).
- Fixture tes hanya boleh naskah sintetis. Jangan pernah memasukkan naskah asli mahasiswa ke repositori.
- Secret hanya dari variabel lingkungan. Jangan commit `.env`.

## Konvensi kode

**Umum**
- Nama di kode dalam Bahasa Inggris (`thesis`, `checkRun`, `accessGrant`). Teks yang tampil ke pengguna dalam Bahasa Indonesia.
- Jangan membuat abstraksi untuk kebutuhan yang belum ada di PRD.

**TypeScript**
- `strict: true`, tanpa `any`. Gunakan `unknown` lalu persempit dengan zod.
- Schema zod untuk setiap request dan response, dipakai bersama di client dan server. Jangan mengembalikan baris database mentah, petakan ke bentuk respons.
- Error bisnis memakai kelas error khusus di `src/server/errors.ts`, dipetakan ke respons `{ "error": { "code": "...", "message": "..." } }` dengan status HTTP yang sesuai.
- Waktu disimpan dan diproses dalam UTC. Konversi ke WIB hanya di UI, kecuali perhitungan batas harian yang memakai hari kalender Asia/Jakarta.
- Uang dalam rupiah sebagai integer, tanpa desimal.
- Kode di `src/server/` tidak boleh diimpor dari komponen client. Beri `import 'server-only'` di modul server.

**UI**
- Server Component secara default, Client Component hanya bila perlu interaksi.
- Warna, radius, bayangan, dan font hanya dari token di `DESIGN.md`. Jangan menulis hex langsung di komponen.
- **Jangan memakai emoji di UI.** Ikon hanya lewat komponen `src/components/ui/Icon.tsx` (SVG lucide-react, daftar nama di `DESIGN.md` bagian 5). Jangan menulis karakter Unicode sebagai ikon dan jangan mengimpor lucide langsung di halaman. Ikon dekoratif otomatis `aria-hidden`, ikon yang membawa arti wajib diberi `label`. Penanda keparahan dan status dibedakan oleh **bentuk ikon dan teks**, bukan warna saja.
- **Pola umpan balik (wajib, lihat `DESIGN.md` bagian 13).** Setiap tindakan yang mengubah data memberi umpan balik: `toast` untuk hasil (berhasil, gagal), `Alert` inline untuk kesalahan yang terkait form atau halaman, `Modal` untuk input singkat, dan `ConfirmDialog` untuk tindakan merusak (hapus, cabut, hentikan). Dilarang memakai `window.confirm` atau `alert`. Tindakan merusak tidak boleh langsung berjalan tanpa konfirmasi.
- **Tiga keadaan data.** Setiap halaman yang memuat data menangani memuat (kerangka `Skeleton`), kosong (`EmptyState` dengan satu tindakan), dan gagal (`ErrorState` dengan tombol coba lagi).
- **Modal memakai `<dialog>` native** lewat `Modal`/`ConfirmDialog` agar fokus terkunci, Esc menutup, dan fokus kembali ke pemicu. Jangan membuat overlay buatan sendiri.
- Palet hijau (hutan sebagai merek, mint sebagai aksen) sesuai `docs/DESIGN.md`. Status memakai token `sev-*` (merah, kuning tua, biru, hijau) selalu dengan simbol dan label. Jangan memakai warna di luar token, termasuk kelas warna bawaan Tailwind seperti `amber-*` atau `emerald-*`.
- Semua teks UI melalui satu berkas kamus (`src/lib/i18n/id.ts`).

**Database**
- Setiap perubahan skema lewat migrasi drizzle-kit, satu migrasi per perubahan logis. Migrasi RLS ditulis sebagai SQL kustom.
- Ikuti nama tabel dan kolom di `docs/ERD.md`. Bila perlu menyimpang, perbarui ERD di commit yang sama.
- Koneksi dari Vercel selalu lewat connection string pooler. Jangan membuka koneksi baru per query di luar klien bersama.

## Pengujian

- Setiap aturan checker: tes unit dengan fixture .docx sintetis (lolos dan melanggar).
- Bangkitkan fixture dengan skrip `tests/fixtures/build-fixtures.ts` (library `docx`), jangan menyimpan .docx buatan tangan tanpa skrip pembuatnya.
- Parser: tes untuk pewarisan gaya (`basedOn`, `docDefaults`), heading manual tanpa style, section dengan format nomor halaman berbeda, dan naskah tanpa `lastRenderedPageBreak`.
- Service akses: tes untuk kode valid, kode dicabut, kode kedaluwarsa, kode sudah dipakai, trial kedua ditolak, upgrade trial ke paket, perpanjangan paket aktif, batas cek trial, batas harian, cek gagal tidak memakai jatah, dan penukaran bersamaan (dua request paralel dengan kode yang sama hanya satu yang berhasil).
- Endpoint: tes otorisasi lintas pengguna dan tes bahwa pengguna biasa tidak bisa mengakses `/api/admin/*`.
- Tes endpoint maintenance: tanpa secret atau dengan secret salah harus ditolak, dan menjalankannya dua kali berturut-turut tidak merusak data.
- Tes autentikasi: pengguna tanpa sesi (401), pengguna baru otomatis mendapat profil dan satu trial (dipanggil berulang tidak membuat trial kedua).
- E2E Playwright untuk alur: admin membuat kode trial, masuk, tukar kode, unggah, cek, laporan, tukar kode paket. Login Google tidak diotomasi: di tes, buat pengguna lewat Supabase Admin API di instance lokal lalu masuk dengan sesi hasil pembuatan itu.
- Target cakupan: `src/server/checkers/` dan `src/server/services/access.ts` minimal 90%.

## Variabel lingkungan

```
# Server saja (jangan pernah berawalan NEXT_PUBLIC_)
DATABASE_URL=                  # connection string pooler Supabase (mode transaction)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=     # untuk Storage dan Admin API
SUPABASE_STORAGE_BUCKET=manuscripts
ACCESS_CODE_HMAC_SECRET=
CRON_SECRET=                   # untuk /api/internal/maintenance, sama dengan secret di GitHub Actions
SUPERADMIN_EMAIL=              # akun ini otomatis menjadi superadmin saat pertama masuk
APP_BASE_URL=https://skrippy.id
FILE_RETENTION_DAYS=30
MAX_UPLOAD_MB=25

# Boleh dibaca browser
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Client ID dan secret Google diatur di dashboard Supabase (Auth > Providers), bukan di env aplikasi.
```

## Definisi selesai

Sebuah tugas dianggap selesai bila:
1. Kode sesuai PRD dan ERD, atau dokumen ikut diperbarui bila ada perubahan yang disengaja.
2. Lint, typecheck, dan tes lolos.
3. Tes baru ditambahkan untuk perilaku baru.
4. Tidak ada isi naskah di log, tidak ada secret di kode, tidak ada service role key yang terbawa ke browser.
5. UI baru sesuai `DESIGN.md`, responsif di 360 px (tanpa luapan horizontal), bisa dipakai dengan keyboard, dan memakai pola umpan balik serta tiga keadaan data di atas.
6. Migrasi database (bila ada) bisa diterapkan pada database kosong.
7. Pemeriksaan naskah tetap selesai di bawah batas 300 detik dan memori 2 GB untuk naskah 25 MB.

## Hal yang tidak boleh dilakukan tanpa persetujuan

- Menambah dependensi AI/LLM atau memanggil API AI.
- Menambah payment gateway, fitur pembayaran, atau iklan di dalam aplikasi, atau mengubah pendaftaran terbuka dengan trial otomatis menjadi model lain.
- Mengubah logika penukaran kode, perhitungan jatah, atau perpanjangan akses.
- Mengubah kebijakan retensi atau penghapusan data.
- Menghapus atau mengganti nama kolom database yang sudah ada di produksi.
- Menambah layanan pihak ketiga yang menerima isi naskah.
- Menambah dependensi native atau biner besar (misalnya LibreOffice) yang tidak muat di Vercel Function.
