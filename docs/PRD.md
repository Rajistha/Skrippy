# PRD: Skrippy

| | |
|---|---|
| Versi | 0.4 (draf) |
| Tanggal | 20 Oktober 2026 |
| Status | Draf untuk ditinjau |
| Dokumen terkait | ERD.md, DESIGN.md, AGENTS.md |

**Perubahan v0.4:** tanpa VPS. Seluruh aplikasi berjalan di Vercel (Next.js) dan Supabase (database, auth, storage). Antrean Celery/Redis dan LibreOffice dihapus. Retensi naskah dipersingkat menjadi 30 hari karena kuota storage gratis 1 GB. Titik keputusan hosting sebelum penjualan kode paket dicatat di bagian 13 dan 12.

**Perubahan v0.3:** nama aplikasi Skrippy (rencana domain skrippy.id), login hanya dengan Google lewat Supabase Auth, default paket 30 hari, nilai trial dan paket diatur admin dari dashboard.

**Perubahan v0.2:** proyek dipersempit menjadi alat pribadi untuk teman dekat. Fase institusi (B2B) dihapus. Sistem kredit dan payment gateway diganti dengan **kode akses**, **masa trial**, dan **satu paket berbayar** yang dibayar langsung ke pemilik.

---

## 1. Ringkasan

Skrippy adalah aplikasi web untuk memeriksa naskah skripsi secara otomatis sebelum bimbingan atau sidang. Mahasiswa mengunggah file .docx, sistem memeriksa **format penulisan, struktur bab, ejaan, dan sitasi** berdasarkan pedoman kampus, lalu menampilkan laporan temuan beserta lokasinya di naskah.

Ini proyek pribadi skala kecil. Pengguna hanya teman dekat yang membutuhkan dan tertarik. **Pendaftaran terbuka dengan trial otomatis:** akun baru (email atau Google) langsung mendapat trial. Perpanjangan memakai kode akses paket yang dibuat dan dibagikan sendiri oleh pemilik.

Fase awal sepenuhnya berbasis aturan (rule-based), tanpa AI. Fitur AI ditambahkan di fase terakhir setelah produk inti stabil. Arsitektur sejak awal dirancang agar modul AI bisa dipasang tanpa membongkar sistem.

## 2. Latar belakang dan masalah

- Mahasiswa sering bolak-balik revisi hanya karena kesalahan format (margin, spasi, penomoran halaman, caption), bukan substansi.
- Pedoman penulisan sering hanya tersedia dalam PDF panjang yang jarang dibaca teliti.
- Ketidaksesuaian antara sitasi di teks dan daftar pustaka sulit dicek manual pada naskah 80 sampai 150 halaman.
- Teman-teman di sekitar pemilik menghadapi masalah yang sama dan bersedia membayar sedikit untuk alat yang membantu.

## 3. Tujuan dan non-tujuan

**Tujuan**
1. Pengguna bisa mengetahui seluruh kesalahan format dan struktur dalam kurang dari 1 menit setelah unggah.
2. Setiap temuan menunjukkan lokasi yang jelas (bab, subbab, paragraf, dan perkiraan halaman bila naskah menyimpan penanda halaman) dan saran perbaikan.
3. Pedoman pemeriksaan bisa dikonfigurasi tanpa mengubah kode.
4. Akses dikendalikan penuh oleh pemilik lewat kode akses, tanpa perlu payment gateway atau legalitas usaha.
5. Biaya server tertutup dari pembayaran paket.

**Non-tujuan**
- Tidak ada pendaftaran publik.
- Tidak ada payment gateway. Pembayaran dilakukan langsung (transfer atau QRIS pribadi) di luar aplikasi.
- Tidak ada akun institusi, lisensi kampus, atau dashboard admin prodi.
- Tidak mendukung PDF sebagai input. Hanya .docx.
- Tidak menilai substansi atau mendeteksi plagiarisme dan tulisan AI (sampai fase 3).
- Tidak mengedit naskah secara otomatis, hanya memberi temuan dan saran.
- Tidak membantu mengakali sistem pemeriksaan kampus. Produk adalah alat persiapan dan perbaikan.

## 4. Persona

| Persona | Kebutuhan utama | Hambatan |
|---|---|---|
| **Rina, teman yang sedang skripsi** | Naskah rapi sebelum bimbingan, tidak dikembalikan karena format | Tidak hafal pedoman, waktu sempit |
| **Pemilik (superadmin)** | Membuat dan membagikan kode akses, mencatat siapa sudah bayar, mengelola pedoman | Waktu terbatas karena proyek sampingan |

## 5. Model akses

### 5.1 Kode akses

Kode akses adalah satu-satunya cara masuk ke aplikasi. Format: `SKR-XXXX-XXXX` (huruf kapital dan angka, tanpa karakter yang mudah tertukar seperti O, 0, I, 1, L).

Ada dua jenis kode:

| Jenis | Fungsi | Dibuat kapan |
|---|---|---|
| **Kode trial** | Membuat akun dan memulai masa trial | Saat teman tertarik mencoba |
| **Kode paket** | Membuat akun langsung dengan paket penuh, atau menaikkan akun trial menjadi paket penuh | Setelah teman membayar |

Aturan kode:
- Satu kode untuk satu orang (sekali pakai) secara default. Pemilik bisa membuat kode multi-pakai bila perlu, misalnya untuk satu kelompok.
- Kode punya batas waktu penukaran (default 14 hari sejak dibuat). Lewat dari itu kode tidak bisa dipakai.
- Kode bisa dicabut sebelum dipakai.
- Setiap kode menyimpan catatan untuk siapa kode itu dan, untuk kode paket, catatan pembayaran (jumlah, tanggal, metode).
- Kode tidak peka huruf besar kecil saat dimasukkan, dan tanda hubung boleh diabaikan.

### 5.2 Masa trial

Semua nilai trial **diatur admin dari dashboard** (Panel admin › Pengaturan), tanpa perlu mengubah kode atau deploy ulang.

| Parameter | Nilai default |
|---|---|
| Durasi | 7 hari sejak kode ditukar |
| Batas cek | 3 cek |
| Fitur | Semua jenis cek (format, struktur, ejaan, sitasi), laporan lengkap |
| Setelah berakhir | Tidak bisa menjalankan cek baru. Riwayat dan laporan lama tetap bisa dibaca sampai masa retensi file habis. |

Trial memberikan fitur lengkap agar teman bisa menilai manfaatnya secara utuh. Pembatasnya hanya durasi dan jumlah cek. Satu akun hanya bisa mendapat trial sekali.

### 5.3 Paket berbayar (satu paket)

Nama, harga, durasi, dan batas wajar paket juga **diatur admin dari dashboard**.

| Parameter | Nilai default |
|---|---|
| Nama | Paket Skripsi |
| Harga | Rp25.000 |
| Durasi | 30 hari sejak kode ditukar |
| Batas cek | Tanpa batas, dengan batas wajar 20 cek per hari untuk mencegah penyalahgunaan |
| Fitur | Semua fitur yang tersedia, termasuk fitur fase 2 begitu dirilis |
| Perpanjangan | Tukar kode paket baru. Bila akses masih aktif, durasi paket ditambahkan ke tanggal berakhir saat ini, bukan dari hari ini. |

Harga dan durasi disimpan di pengaturan aplikasi, bukan di kode program. Kode yang sudah dibuat menyimpan salinan durasi dan batasnya sendiri, sehingga perubahan pengaturan tidak memengaruhi kode lama.

### 5.4 Alur pembayaran (di luar aplikasi)

1. Teman menghubungi pemilik (misalnya lewat WhatsApp).
2. Teman membayar lewat transfer atau QRIS pribadi.
3. Pemilik membuka panel admin, membuat kode paket, mengisi catatan pembayaran.
4. Pemilik menyalin pesan siap kirim (berisi kode dan tautan) lalu mengirimkannya ke teman.
5. Teman memasukkan kode di aplikasi.

Bila suatu saat pengguna bertambah banyak, payment gateway bisa ditambahkan tanpa mengubah model akses: pembayaran yang berhasil cukup membuat kode paket secara otomatis.

## 6. Ruang lingkup per fase

### Fase 1: MVP (target 6 sampai 8 minggu)
- Masuk atau daftar dengan email + kata sandi atau Google (Supabase Auth), akun baru otomatis mendapat trial
- Masa trial dan paket berbayar
- Panel admin: buat kode, lihat status kode dan pengguna, cabut kode, perpanjang akses manual
- Unggah .docx dan pemilihan pedoman
- Pemeriksaan format, struktur, ejaan berbasis aturan, dan sitasi
- Laporan hasil pemeriksaan di web, dengan skor dan daftar temuan
- Riwayat pemeriksaan
- 1 pedoman bawaan (pedoman umum skripsi Indonesia) + pedoman kampus pemilik

### Fase 2: Fitur lanjutan (sudah dibuat)
- Unduh laporan PDF
- File PDF dan .docx naskah bersorot (teks bermasalah disorot; PDF menyusun ulang teks karena halaman Word tidak dirender)
- Perbandingan antarversi (temuan yang sudah diperbaiki, yang baru, yang tetap)
- Berbagi laporan ke dosen lewat tautan baca saja yang bisa dicabut
- Pengingat email 3 hari sebelum akses berakhir (aktif bila RESEND_API_KEY dan EMAIL_FROM diisi; tanpa itu dilewati)

### Fase 3: AI (sudah dibuat, opsional)
AI hanya aktif bila admin menghubungkan kunci API di Pengaturan. Tanpa itu aplikasi berjalan penuh dan pengguna melihat "AI belum bisa digunakan". Pengguna memilih sendiri analisis AI per cek; teks naskah dikirim ke penyedia AI hanya saat itu (diungkap di kebijakan privasi).
- Pemeriksaan tata bahasa dan kalimat dengan LLM
- Konsistensi antarbab (rumusan masalah, tujuan, kesimpulan)
- Saran perbaikan kalimat
- Batas wajar cek AI per hari dalam paket, karena ada biaya API per halaman

## 7. Kebutuhan fungsional

Prioritas: **P0** wajib di MVP, **P1** fase 2, **P2** fase 3.

### 7.1 Akses dan autentikasi
| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-ACC-01 | Pendaftaran terbuka. Bila trial dinyalakan admin, akun baru (dan akun lama tanpa akses) otomatis mendapat trial; bila dimatikan, akun baru terkunci sampai menukar kode paket | P0 |
| FR-ACC-02 | Masuk hanya dengan akun Google lewat Supabase Auth. Tidak ada email dan kata sandi. | P0 |
| FR-ACC-03 | Setelah trial atau paket habis, pengguna menukar kode paket dari admin di halaman Akses untuk memperpanjang. | P0 |
| FR-ACC-04 | Halaman "Tukar kode" untuk menaikkan trial ke paket atau memperpanjang paket | P0 |
| FR-ACC-05 | Pengguna melihat status akses: jenis, sisa hari, sisa cek (trial) | P0 |
| FR-ACC-06 | Cek baru diblokir bila akses berakhir atau batas cek habis, dengan pesan cara mendapatkan kode | P0 |
| FR-ACC-08 | Hapus akun beserta seluruh naskah | P0 |
| FR-ACC-09 | Pembatasan percobaan penukaran kode (rate limit) | P0 |

### 7.2 Skripsi dan dokumen
| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-DOC-01 | Membuat "skripsi" (judul, pedoman) sebagai wadah beberapa versi naskah | P0 |
| FR-DOC-02 | Unggah .docx maksimal 25 MB dengan drag and drop | P0 |
| FR-DOC-03 | Validasi file: ekstensi, MIME, ukuran, file tidak rusak, tidak terproteksi kata sandi | P0 |
| FR-DOC-04 | Setiap unggahan baru menjadi versi baru (v1, v2, ...) | P0 |
| FR-DOC-05 | Pengguna bisa menghapus versi kapan saja | P0 |
| FR-DOC-06 | File dihapus otomatis setelah 30 hari tanpa aktivitas | P0 |

### 7.3 Pemeriksaan
| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-CHK-01 | Pengguna memilih jenis cek: format, struktur, ejaan, sitasi (default semua) | P0 |
| FR-CHK-02 | Sebelum cek dijalankan, tampil sisa jatah (trial) atau keterangan batas wajar (paket) | P0 |
| FR-CHK-03 | Cek diproses di latar belakang, status tampil real time (antre, diproses, selesai, gagal) | P0 |
| FR-CHK-04 | Cek yang gagal karena kesalahan sistem tidak dihitung ke jatah | P0 |
| FR-CHK-05 | Pedoman di-snapshot saat cek dijalankan | P0 |
| FR-CHK-06 | Pengguna bisa menandai temuan sebagai "diabaikan" atau "salah deteksi" | P1 |
| FR-CHK-07 | Cek AI | P2 |

### 7.4 Laporan
| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-RPT-01 | Skor total 0 sampai 100 dan skor per kategori | P0 |
| FR-RPT-02 | Daftar temuan dengan filter kategori, tingkat keparahan, dan bab | P0 |
| FR-RPT-03 | Setiap temuan berisi kode aturan, pesan, kutipan teks, lokasi, saran | P0 |
| FR-RPT-04 | Pratinjau naskah dengan penanda lokasi temuan | P1 |
| FR-RPT-05 | Unduh laporan PDF | P1 |
| FR-RPT-06 | Unduh PDF dan .docx naskah bersorot | P1 |
| FR-RPT-07 | Perbandingan hasil antarversi | P1 |
| FR-RPT-08 | Tautan berbagi laporan (baca saja, bisa dicabut, kedaluwarsa 14 hari) | P1 |

### 7.5 Pedoman
| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-GDL-01 | Pedoman disimpan sebagai konfigurasi aturan (JSON), bukan kode | P0 |
| FR-GDL-02 | Superadmin membuat, mengubah, dan menerbitkan versi pedoman, termasuk mengunggah PDF atau Word buku pedoman yang dibaca otomatis (pola teks, tanpa AI) menjadi usulan aturan untuk ditinjau | P0 |
| FR-GDL-03 | Pedoman bisa diturunkan dari pedoman lain | P1 |
| FR-GDL-04 | Pengguna bisa mengusulkan pedoman kampusnya (unggah PDF pedoman), superadmin yang menyusunnya | P1 |

### 7.6 Panel admin
| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-ADM-01 | Buat kode akses: jenis, jumlah (satu atau beberapa sekaligus), untuk siapa, catatan pembayaran | P0 |
| FR-ADM-02 | Tombol salin pesan siap kirim berisi kode, tautan aplikasi, dan masa berlaku | P0 |
| FR-ADM-03 | Daftar kode dengan status: aktif, sudah dipakai (oleh siapa, kapan), kedaluwarsa, dicabut | P0 |
| FR-ADM-04 | Cabut kode yang belum dipakai | P0 |
| FR-ADM-05 | Daftar pengguna dengan status akses, sisa hari, jumlah cek | P0 |
| FR-ADM-06 | Perpanjang atau hentikan akses pengguna secara manual, dengan alasan tercatat | P0 |
| FR-ADM-07 | Pengaturan: durasi dan batas trial, harga, durasi, dan batas wajar paket | P0 |
| FR-ADM-08 | Rekap sederhana: jumlah pengguna aktif, cek per minggu, total pembayaran tercatat | P0 |
| FR-ADM-09 | Log audit tindakan admin | P0 |

## 8. Aturan pemeriksaan MVP

Nilai default mengikuti pedoman skripsi yang umum di Indonesia. Semua nilai bisa diubah per pedoman.

**Tingkat keparahan:** kritis (pasti dikembalikan dosen), sedang (sebaiknya diperbaiki), ringan (saran).

### Format (FMT)
| Kode | Aturan | Default | Keparahan |
|---|---|---|---|
| FMT-001 | Ukuran kertas | A4 | Kritis |
| FMT-002 | Margin | kiri 4 cm, atas 4 cm, kanan 3 cm, bawah 3 cm | Kritis |
| FMT-003 | Jenis huruf isi | Times New Roman | Sedang |
| FMT-004 | Ukuran huruf isi | 12 pt | Sedang |
| FMT-005 | Spasi baris isi | 1,5 atau 2 (sesuai pedoman) | Sedang |
| FMT-006 | Indentasi baris pertama paragraf | 1,25 cm | Ringan |
| FMT-007 | Perataan paragraf | Rata kiri kanan (justify) | Ringan |
| FMT-008 | Format judul bab | "BAB I", huruf kapital, tengah, tebal | Sedang |
| FMT-009 | Penomoran halaman | Romawi kecil di bagian awal, angka Arab mulai Bab I | Kritis |
| FMT-010 | Caption | Tabel di atas, gambar di bawah, bernomor per bab (Tabel 2.1) | Sedang |
| FMT-011 | Penomoran caption berurutan tanpa lompat | | Sedang |
| FMT-012 | Judul subbab: tebal dan (bila pedoman meminta) huruf kapital tiap kata | Ringan |
| FMT-013 | Spasi daftar pustaka sesuai `reference_line_spacing` (default 1) | Ringan |
| FMT-014 | Satu bagian paragraf memakai jenis huruf lain dari huruf isi | Ringan |
| FMT-015 | Daftar pustaka memakai indentasi gantung | Ringan |
| FMT-016 | Halaman judul memuat logo, NIM, dan tahun | Ringan |
| FMT-017 | "Tabel N" atau "Gambar N" dirujuk di teks tetapi tidak ada caption-nya | Ringan |
| FMT-018 | Caption tabel atau gambar tidak pernah dirujuk di teks | Ringan |
| FMT-019 | Gambar atau tabel lebih lebar dari area teks | Sedang |
| FMT-020 | Gambar tanpa caption | Ringan |
| FMT-021 | Tabel tanpa caption | Ringan |
| FMT-022 | Persamaan tanpa nomor | Ringan |
| FMT-023 | Perubahan terlacak (track changes) atau komentar Word tersisa | Sedang |
| FMT-024 | Header ada di sebagian bagian isi saja | Ringan |
| FMT-025 | Catatan kaki pada gaya sitasi APA atau IEEE | Ringan |
| FMT-026 | Properti dokumen (judul, penulis) kosong | Ringan |
| FMT-027 | Gambar tanpa teks alternatif | Ringan |
| FMT-028 | Tabel 3 baris atau lebih tanpa baris judul yang ditandai | Ringan |
| FMT-029 | Huruf di dalam tabel berbeda dari huruf isi atau lebih besar dari ukuran isi | Ringan |

### Struktur (STR)
| Kode | Aturan | Keparahan |
|---|---|---|
| STR-001 | Bagian wajib ada: halaman judul, lembar pengesahan, abstrak, kata pengantar, daftar isi, Bab I sampai Bab V (atau sesuai pedoman), daftar pustaka | Kritis |
| STR-002 | Urutan bagian sesuai pedoman | Sedang |
| STR-003 | Daftar isi sesuai dengan judul bab dan subbab di naskah | Sedang |
| STR-004 | Penomoran subbab konsisten (1.1, 1.2, 1.2.1) | Sedang |
| STR-005 | Panjang abstrak dalam batas (misal 150 sampai 300 kata) | Ringan |
| STR-006 | Bab kosong atau kurang dari `min_chapter_words` kata (default 100) | Sedang |
| STR-007 | Subbab wajib per bab (`required_subsections`, hanya bila pedoman mengaturnya) | Sedang |
| STR-008 | Jumlah entri daftar tabel atau gambar sama dengan jumlah caption | Ringan |
| STR-009 | Subbab kosong (judul diikuti judul lain tanpa isi) | Ringan |
| STR-010 | Daftar isi diketik manual, bukan fitur otomatis Word | Ringan |
| STR-011 | Bab III menyebut populasi/sampel, instrumen, dan teknik analisis (`methodology_keywords`) | Ringan |
| STR-012 | Rumusan masalah punya jejak kata kunci di Bab IV atau V | Ringan |
| STR-013 | Paragraf yang hampir sama persis dengan paragraf lain (salin-tempel) | Sedang |

### Ejaan (EJA), berbasis aturan
| Kode | Aturan | Keparahan |
|---|---|---|
| EJA-001 | Kata tidak baku (berdasarkan daftar pasangan tidak baku dan baku) | Sedang |
| EJA-002 | Penulisan "di" dan "ke" sebagai kata depan atau awalan (heuristik terbatas) | Sedang |
| EJA-003 | Spasi ganda | Ringan |
| EJA-004 | Spasi sebelum tanda baca atau tanpa spasi sesudahnya | Ringan |
| EJA-005 | Huruf kapital di awal kalimat | Ringan |
| EJA-006 | Istilah asing umum tidak dicetak miring (berdasarkan daftar istilah) | Ringan |
| EJA-007 | Kata berulang berurutan ("yang yang") | Ringan |
| EJA-008 | Kurung, kurung siku, atau tanda kutip tidak berpasangan; tanda baca ganda | Ringan |
| EJA-009 | Angka dan satuan ditulis menyatu ("50kg") | Ringan |
| EJA-010 | Kalimat lebih panjang dari `max_sentence_words` (default 40) | Ringan |
| EJA-011 | Istilah sama ditulis tidak konsisten dengan dan tanpa tanda hubung ("e-commerce"/"ecommerce") | Ringan |
| EJA-012 | Singkatan dipakai sebelum dijelaskan, atau dijelaskan tetapi tidak pernah dipakai | Ringan |

Catatan: ejaan berbasis aturan sengaja konservatif agar tidak banyak temuan palsu. Pemeriksaan tata bahasa yang lebih dalam menunggu fase 3.

### Sitasi (SIT)
| Kode | Aturan | Keparahan |
|---|---|---|
| SIT-001 | Sitasi di teks tidak ada di daftar pustaka | Kritis |
| SIT-002 | Entri daftar pustaka tidak pernah disitasi | Sedang |
| SIT-003 | Daftar pustaka tidak urut alfabet (gaya APA) | Sedang |
| SIT-004 | Tahun di sitasi berbeda dengan tahun di daftar pustaka | Sedang |
| SIT-005 | Proporsi sumber lebih dari N tahun terlalu besar (default 10 tahun) | Ringan |
| SIT-006 | Format entri daftar pustaka APA: tahun dalam kurung diikuti titik, nama Belakang, Inisial | Ringan |
| SIT-007 | Gaya sitasi tercampur (nama-tahun dan bernomor) | Sedang |
| SIT-008 | "dkk." dipakai untuk sumber dengan kurang dari tiga penulis | Ringan |
| SIT-009 | Entri daftar pustaka ganda | Ringan |
| SIT-010 | Artikel jurnal atau prosiding tanpa DOI atau URL | Ringan |
| SIT-011 | Kutipan langsung tanpa nomor halaman | Ringan |

Gaya sitasi MVP: APA (nama, tahun). IEEE menyusul di fase 2 bila ada teman yang membutuhkan.

### Skor
- Skor kategori = 100 dikurangi penalti (kritis 10, sedang 3, ringan 1), minimum 0. Bobot bisa diatur per pedoman.
- Skor total = rata-rata berbobot skor kategori yang dijalankan.
- Skor adalah indikator, bukan penilaian resmi. Ini dinyatakan jelas di laporan.

## 9. Kebutuhan non-fungsional

| Area | Kebutuhan |
|---|---|
| Skala | Dirancang untuk puluhan pengguna, bukan ribuan. Berjalan di tier gratis Vercel dan Supabase, tanpa server sendiri. |
| Kinerja | Naskah 100 halaman selesai diperiksa dalam p95 kurang dari 60 detik. |
| Privasi | Naskah milik pengguna, tidak dipakai untuk hal lain, tidak dibagikan. Tetap mengikuti prinsip UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi meski skalanya kecil. |
| Keamanan | Login didelegasikan ke Google lewat Supabase Auth, kode akses acak dengan entropi cukup, rate limit penukaran kode, file hanya diakses lewat URL bertanda tangan berumur pendek. |
| Retensi | Naskah dihapus otomatis setelah 30 hari tanpa aktivitas (kuota storage gratis Supabase 1 GB). |
| Kuota gratis | Supabase gratis: database 500 MB, storage 1 GB, egress 5 GB per bulan, dan proyek ditidurkan setelah seminggu tanpa aktivitas, sehingga perlu job terjadwal harian. Vercel Hobby: function maksimal 300 detik dan 2 GB memori. |
| Ketersediaan | Upaya terbaik. Gangguan sesekali bisa diterima, tapi data tidak boleh hilang (backup database harian). |
| Bahasa | Antarmuka Bahasa Indonesia. |
| Perangkat | Responsif dari lebar 360 px. |
| Aksesibilitas | WCAG 2.1 AA sebagai target. |

## 10. Alur pengguna utama

**Alur 1: Teman mencoba (trial)**
1. Pemilik membuat kode trial dan mengirim pesan siap kirim lewat WhatsApp
2. Teman membuka tautan, memasukkan kode
3. Masuk dengan Google
4. Pilih pedoman, buat skripsi, unggah .docx
5. Jalankan cek, lihat laporan lengkap
6. Banner di dashboard menampilkan sisa hari dan sisa cek trial

**Alur 2: Trial ke paket**
1. Trial hampir habis, banner berisi ajakan menghubungi pemilik
2. Teman membayar langsung ke pemilik
3. Pemilik membuat kode paket dengan catatan pembayaran, mengirimkannya
4. Teman membuka "Tukar kode", memasukkan kode, akses berubah menjadi paket 30 hari

**Alur 3: Langsung beli paket**
1. Teman sudah membayar sebelum mencoba
2. Pemilik membuat kode paket, teman mendaftar langsung dengan kode itu

**Alur 4: Revisi**
1. Unggah versi baru pada skripsi yang sama
2. Jalankan cek
3. (Fase 2) Lihat perbandingan: diperbaiki, baru, tetap

## 11. Ukuran keberhasilan

Karena lingkupnya teman dekat, ukurannya sederhana:
- Teman yang mencoba trial lalu membeli paket: minimal separuh.
- Teman yang memakai lebih dari satu kali (mengunggah revisi): mayoritas.
- Temuan yang dilaporkan salah deteksi: sedikit dan makin berkurang.
- Pembayaran paket cukup menutup biaya server.

## 12. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Struktur .docx sangat beragam (heading manual tanpa style, text box, tabel bersarang) | Deteksi heading lewat style Word dan pola teks ("BAB I"). Uji dengan naskah teman (dengan izin, tidak masuk repositori). |
| Temuan palsu membuat pengguna tidak percaya | Aturan ejaan konservatif, tombol "salah deteksi", minta masukan langsung dari teman. |
| Nomor halaman tidak bisa dirender tanpa LibreOffice | Periksa penomoran lewat struktur dokumen (pengaturan section dan field PAGE di footer). Perkiraan halaman diambil dari penanda `lastRenderedPageBreak` yang ditulis Word saat menyimpan (perlu diuji dengan naskah nyata). Bila tidak ada, lokasi temuan hanya sampai bab dan paragraf. |
| Vercel Hobby hanya untuk penggunaan non-komersial, dan penjualan kode paket bisa dianggap komersial walau pembayaran lewat WhatsApp | Fase trial dan uji coba tanpa pembayaran aman. Sebelum menjual kode paket pertama, tanyakan ke support Vercel. Bila tidak diizinkan, pindahkan hosting (VPS lokal sekitar Rp87.000 per bulan, tanpa kartu kredit). Pemeriksa dibuat sebagai fungsi murni agar mudah dipindah. |
| Supabase gratis menidurkan proyek yang tidak aktif seminggu | Job terjadwal harian (GitHub Actions) memanggil endpoint ringan, sekaligus menjalankan retensi dan pembersihan. |
| Naskah besar dengan banyak gambar membebani memori function | Hanya `word/document.xml`, styles, numbering, dan footer yang dibaca. Folder media tidak diekstrak. |
| Kode akses tersebar ke orang lain | Kode sekali pakai, batas waktu penukaran, bisa dicabut, terlihat siapa yang memakai. |
| Satu akun dipakai bersama | Batas wajar cek per hari, dan pada dasarnya diselesaikan secara pertemanan. |
| Pencatatan pembayaran manual tercecer | Catatan pembayaran wajib diisi saat membuat kode paket, rekap di panel admin. |
| Waktu pengembangan terbatas | Pegang ketat ruang lingkup MVP, satu bahasa (TypeScript), satu deploy di Vercel. |

## 13. Pertanyaan terbuka

1. Pedoman kampus mana yang dipakai pertama (kemungkinan kampus pemilik sendiri). Butuh file PDF pedoman resminya.
2. Ketersediaan domain skrippy.id.
3. Keputusan hosting sebelum kode paket berbayar pertama dijual: tetap di Vercel Hobby (setelah bertanya ke support Vercel) atau pindah ke VPS lokal.

**Sudah diputuskan**
- Harga dan durasi paket: diatur admin dari dashboard, default Rp25.000 untuk 30 hari.
- Durasi dan batas trial: diatur admin dari dashboard, default 7 hari dan 3 cek.
- Login: hanya Google, lewat Supabase Auth.
- Nama aplikasi: Skrippy.
