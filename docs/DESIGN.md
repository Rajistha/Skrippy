# DESIGN.md: Skrippy

Panduan desain visual dan UX. Dua acuan, satu palet:

- **Landing page** mengikuti tata letak referensi "Cloud": hero bergelombang dua kolom, tiga kartu fitur dengan kartu tengah solid, showcase dua kolom, alur kerja, harga, banner CTA lebar, footer multi-kolom.
- **Dashboard** mengikuti tata letak referensi "Donezo": sidebar kiri bergrup, bilah atas dengan profil, kartu statistik (kartu pertama solid hijau), grafik batang pil, kartu pengingat, daftar, grafik setengah lingkaran, dan kartu gelap bergradasi.
- **Warna** keduanya memakai palet hijau dari referensi Donezo: hijau hutan sebagai merek, hijau mint sebagai sorotan, latar putih kehijauan. Tidak ada ungu, indigo, atau emas.

Token ada di `src/styles/tokens.css` dan menjadi satu-satunya sumber warna, radius, bayangan, dan font.

---

## 1. Prinsip desain

1. **Tenang dan meyakinkan.** Mahasiswa membuka aplikasi ini saat cemas menjelang bimbingan. Antarmuka lapang, rapi, dan tidak ramai.
2. **Temuan harus bisa ditindaklanjuti.** Setiap kesalahan menunjukkan lokasi dan saran perbaikan, bukan hanya angka.
3. **Satu tindakan utama per layar.** Tombol primer hijau pekat hanya satu per tampilan.
4. **Jujur soal batas akses.** Sisa hari dan sisa cek selalu terlihat.
5. **Ramah ponsel.** Semua grid melipat ke satu kolom di 360 px, target sentuh minimal 44 px, navigasi bawah di ponsel.
6. **Bebas emoji.** Ikon memakai simbol Unicode monokrom (bagian 5).

## 1a. Merek

- **Nama:** Skrippy. Domain rencana: skrippy.id.
- **Wordmark:** "skrippy" huruf kecil, Poppins 700, spasi huruf -0,02em. Warna `primary-500` di latar terang, putih di latar hijau tua.
- **Logomark:** simbol ✦ di dalam kotak `radius-md` berlatar `gradient-hero`.
- **Kesan:** profesional akademik, segar, presisi, ramah mahasiswa.

## 2. Warna

### 2.1 Token (mode terang)

**Primer: hijau hutan** (merek, tombol, sidebar aktif)

| Token | Hex | Penggunaan |
|---|---|---|
| `primary-50` | `#EEF8F2` | Latar kartu lembut, hover, item sidebar aktif |
| `primary-100` | `#D9F0E2` | Latar kotak ikon, chip |
| `primary-200` | `#B2E0C6` | Cincin fokus, garis aksen lembut |
| `primary-300` | `#84CBA4` | Batang grafik sekunder, ikon nonaktif |
| `primary-400` | `#52B183` | Batang grafik, titik status |
| `primary-500` | `#1F7A4E` | **Warna merek utama**, tombol primer |
| `primary-600` | `#1A6844` | Hover tombol, tautan |
| `primary-700` | `#155636` | Tombol ditekan, teks tautan |
| `primary-800` | `#10432B` | Latar kartu gelap, footer |
| `primary-900` | `#0B2F1E` | Latar paling gelap, teks di atas mint |

**Aksen: hijau mint** (sorotan di atas hijau tua, grafik terang)

| Token | Hex | Penggunaan |
|---|---|---|
| `accent-50` | `#F1FAF5` | Latar badge |
| `accent-100` | `#DFF5E8` | Pill sambutan |
| `accent-300` | `#8FDDB1` | **Tombol CTA di atas latar hijau tua**, kata sorotan di judul hero |
| `accent-400` | `#5FCB92` | Hover tombol mint, batang grafik terang |
| `accent-500` | `#34A56F` | Garis grafik |
| `accent-700` | `#1D6B45` | Teks aksen di latar terang |

**Netral** (abu-abu dengan rona hijau)

| Token | Hex | Penggunaan |
|---|---|---|
| `ink-900` | `#0F1A14` | Judul |
| `ink-700` | `#2B3A32` | Subjudul, label form |
| `ink-500` | `#55655C` | Teks isi |
| `ink-400` | `#66756C` | Teks sekunder, placeholder, border input (kontras 4,9:1) |
| `ink-200` | `#DDE5E0` | Border |
| `ink-100` | `#EBF0ED` | Pemisah, batang kosong |
| `surface` | `#FFFFFF` | Kartu, panel |
| `canvas` | `#F2F4F1` | Latar halaman |

### 2.2 Status dan keparahan

Warna **tidak pernah** menjadi satu-satunya penanda: selalu simbol dan label teks. Status memakai token `sev-*`, bukan warna bawaan Tailwind.

| Status | Simbol | Teks | Latar |
|---|---|---|---|
| Kritis | ● | `#B42318` | `#FEE4E2` |
| Sedang | ▲ | `#B54708` | `#FEF0C7` |
| Ringan | ○ | `#175CD3` | `#EAF2FF` |
| Berhasil | ✓ | `#1A6844` | `#D9F0E2` |
| Netral | ◇ | `ink-500` | `ink-100` |

### 2.3 Gradien dan pola

- `gradient-hero`: `linear-gradient(135deg, #1C6E47 0%, #145A38 55%, #0B2F1E 100%)`. Hero, kartu statistik solid, kartu status akses, banner CTA.
- `gradient-cta`: `linear-gradient(135deg, #1C6E47 0%, #0F4D31 100%)`. Tombol CTA di atas latar terang.
- `.stripes`: garis diagonal tipis untuk data yang belum ada (batang grafik kosong, bagian "pending").
- Hero landing diakhiri kurva gelombang organik (SVG) yang bertransisi ke `canvas`.

### 2.4 Mode gelap

Belum didukung. Aplikasi selalu tampil terang (`color-scheme: light`), apa pun pengaturan sistem pengguna, karena mockup dan kartu memakai permukaan putih. Mode gelap bisa ditambahkan nanti dengan menimpa token di `:root[data-theme="dark"]` setelah semua komponen memakai token `surface`.

## 3. Tipografi

| Peran | Font | Catatan |
|---|---|---|
| Judul dan angka | Poppins 600, 700 | Geometris dan tebal |
| Isi dan UI | Inter 400, 500, 600 | |
| Kutipan naskah | Source Serif 4 400, italic | Membedakan kutipan mahasiswa dari teks UI |
| Kode aturan | JetBrains Mono 500 | `FMT-002`, `SKR-XXXX-XXXX` |

Skala: `display` 48/56 (ponsel 32/40), `h1` 36/44, `h2` 28/36, `h3` 20/28, `body` 15/24, `body-sm` 13/20, `label` 13/16 semibold, `overline` 12/16 huruf kapital spasi 0,08em. Angka statistik dashboard: Poppins 700, 40/48.

## 4. Spasi, grid, dan bentuk

- Basis 4 px. Kontainer landing maksimal 1240 px, gutter 24 px (ponsel 16 px). Jarak antarbagian landing 96 px desktop, 64 px ponsel.
- Radius: `sm` 8, `md` 12, `lg` 16, `xl` 24 (kartu dashboard), `hero` 40, `full` (tombol, pill, badge).
- Bayangan berona hijau: `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-cta`.
- Titik henti: `sm` 640, `md` 768, `lg` 1024, `xl` 1280.

## 5. Ikon

Ikon memakai **SVG dari pustaka `lucide-react`**, hanya lewat komponen `Icon` (`<Icon name="done" />`). Tanpa emoji dan tanpa karakter Unicode sebagai ikon.

- **Ukuran** mengikuti teks (`1em`); ikon mandiri 20 sampai 24 px. **Garis** 2 px (3 px untuk centang kecil di dalam lingkaran).
- **Warna** mewarisi `currentColor`.
- **Aksesibilitas:** ikon dekoratif otomatis `aria-hidden`. Ikon yang membawa arti sendirian wajib `label`.
- **Status dan keparahan dibedakan oleh bentuk dan teks, bukan warna saja:**

| Arti | Bentuk | Nama ikon |
|---|---|---|
| Kritis / galat | segi delapan berseru | `critical` |
| Sedang / peringatan | segitiga berseru | `major`, `warning` |
| Ringan / info | lingkaran huruf i | `minor`, `info` |
| Berhasil | lingkaran centang | `success` |
| Memproses | lingkaran berputar | `spinner` (animasi) |

| Fungsi | Nama | | Fungsi | Nama |
|---|---|---|---|---|
| Dashboard | `dashboard` | | Format | `format` |
| Skripsi | `thesis` | | Struktur | `structure` |
| Unggah | `upload`, `cloudUpload` | | Ejaan | `spelling` |
| Riwayat | `history` | | Sitasi | `citation` |
| Paket / Trial | `package` / `trial` | | Selesai | `done` |
| Kode akses | `code` | | Tutup | `close` |
| Panel admin | `admin` | | Tambah / kurang | `plus` / `minus` |
| Pengaturan | `settings` | | Salin | `copy` |
| Keluar | `signOut` | | Hapus | `trash` |
| Tautan keluar | `external` | | WhatsApp | `whatsapp` |

Daftar lengkap ada di `src/components/ui/Icon.tsx`. Menambah ikon berarti menambah satu entri di sana. Satu-satunya elemen berwarna di luar palet adalah logo "G" Google di tombol masuk (panduan merek Google).

## 6. Mockup dan visual

Tidak memakai ilustrasi orang. Visual produk dibuat dari komponen asli (kartu skor, cincin, daftar temuan) dalam bingkai ponsel dan desktop, sehingga tampilannya jujur terhadap isi aplikasi. Data pada mockup landing adalah contoh dan diberi label "Contoh laporan".

## 7. Komponen

### 7.1 Tombol (semua berbentuk pil)

| Varian | Tampilan | Penggunaan |
|---|---|---|
| Primer | `primary-500`, teks putih, `shadow-cta`, tinggi 44 px | Satu tindakan utama per layar |
| CTA | `gradient-cta`, teks putih | "Tukar kode" |
| Mint | `accent-300`, teks `primary-900`, tebal | Tombol utama di atas latar hijau tua (hero, banner) |
| Outline | border `primary-500`, teks `primary-600` | Tindakan kedua di dashboard ("Tukar kode") |
| Outline terang | border putih 60%, teks putih | Tindakan kedua di atas hijau tua |
| Putih | latar putih, teks `primary-700` | Navbar di atas hero |
| Sekunder / Ghost | `primary-50` / tanpa latar | Tindakan pendamping |
| Bahaya | `sev-critical-bg`, berubah solid saat konfirmasi | Hapus |

Hover menggelap satu tingkat, fokus cincin 3 px `primary-200` offset 2 px, nonaktif opasitas 45%, loading "Memproses..." dengan ◌ berputar.

### 7.2 Kartu dan pill

- **Kartu dashboard:** putih, `radius-xl`, padding 20 sampai 24 px, tanpa border tebal, `shadow-sm`.
- **Kartu statistik:** judul kecil + tombol bulat berpanah di kanan atas, angka besar Poppins, catatan kecil di bawah. **Kartu pertama solid `gradient-hero` dengan teks putih.**
- **Kartu gelap:** `gradient-hero` dengan pola lengkung samar, dipakai untuk status akses dan ajakan.
- **Badge keparahan:** simbol + label, contoh "● Kritis". **Kode aturan:** JetBrains Mono di latar `ink-100`.
- **Chip status** (Selesai, Diproses, Antre, Gagal): pil kecil `sev-*` dengan simbol.

### 7.3 Grafik

- **Batang pil** (skor per versi): pil vertikal, tinggi sebanding skor; versi aktif `primary-500`, terbaik `primary-900`, lainnya `primary-300`/`accent-400`, data kosong memakai `.stripes`.
- **Setengah lingkaran** (skor per kategori): busur `primary-500`, `primary-900`, `.stripes` untuk bagian kosong, angka besar di tengah.
- **Cincin skor** di laporan: gradien hijau, terisi 800 ms.
- Semua grafik punya teks alternatif dan nilai angka yang terbaca tanpa warna.

### 7.4 Form, input kode, zona unggah, stepper, laporan

Mengikuti gaya lama dengan token hijau: input tinggi 44 px, border `ink-200`, fokus `primary-500` + cincin `primary-100`. Input kode: JetBrains Mono 18 px, kapital otomatis, tanda hubung otomatis, placeholder `SKR-XXXX-XXXX`. Zona unggah: border putus-putus `primary-300`, latar `primary-50`, `radius-xl`. Stepper: Diunggah, Antre, Diperiksa, Selesai. Kartu temuan: badge, kode aturan, kutipan serif, lokasi, saran berawalan →.

### 7.5 Banner status akses

Muncul hanya bila perlu tindakan: trial aktif (latar `accent-50`), hampir habis (latar `sev-critical-bg`, simbol ▲), berakhir ("Akses kamu sudah berakhir. Riwayat tetap bisa dibaca."). Tidak memanggil API sampai benar-benar ditampilkan.

### 7.6 Modal dan dialog konfirmasi

- Dibangun di atas elemen `<dialog>` native: fokus terkunci di dalam, latar belakang inert, **Esc menutup**, fokus kembali ke pemicu saat ditutup, gulir latar dikunci.
- Struktur: ikon bulat (opsional) + judul + deskripsi, isi, lalu footer tombol. Tombol utama di kanan (desktop) atau paling atas (ponsel, urutan terbalik).
- Ukuran `sm` (konfirmasi), `md` (formulir), `lg` (hasil dengan banyak isi). **Di ponsel tampil sebagai lembar dari bawah** dengan sudut atas membulat.
- **Dialog konfirmasi** wajib untuk tindakan merusak. Judul berbentuk pertanyaan ("Hapus versi ini?"), deskripsi menjelaskan akibatnya, tombol memakai kata kerja spesifik ("Hapus versi", bukan "Ya"). Selama memproses, tombol loading dan dialog tidak bisa ditutup. Kegagalan menampilkan `Alert` di dalam dialog dan dialog tetap terbuka.
- Modal formulir memvalidasi saat dikirim, menampilkan error di bawah kolom yang bermasalah, memberi fokus awal ke kolom pertama, dan menghapus error begitu pengguna mengetik ulang.

### 7.7 Toast (pemberitahuan sementara)

| Nada | Ikon | Durasi | Peran ARIA |
|---|---|---|---|
| Berhasil | lingkaran centang | 5 detik | `status` |
| Info | lingkaran i | 5 detik | `status` |
| Peringatan | segitiga | 5 detik (atau tetap, mis. koneksi terputus) | `status` |
| Kesalahan | segi delapan | 8 detik | `alert` |

- Posisi: kanan atas di desktop, atas penuh lebar di ponsel (tidak menutup navigasi bawah). Maksimal 4 tampil, yang terbaru di atas.
- Berhenti menghitung mundur saat kursor atau fokus ada di atasnya. Selalu ada tombol tutup. Boleh memuat satu tindakan teks ("Urungkan").
- Toast dengan `id` yang sama menggantikan yang lama (mis. status koneksi). Pesan singkat, satu kalimat, tanpa istilah teknis.
- Toast untuk **hasil tindakan**. Kesalahan yang terkait form atau halaman memakai `Alert` inline, karena toast menghilang.

### 7.8 Alert, menu, dan keadaan data

- **Alert** inline: ikon berbentuk khas + teks, empat nada (info, berhasil, peringatan, error), boleh memuat tombol tindakan. Error memakai `role="alert"`.
- **Menu akun** (popover di bilah atas): Esc menutup dan mengembalikan fokus, panah atas/bawah berpindah item, klik di luar menutup. Item berbahaya (Keluar) berwarna `sev-critical`.
- **Memuat:** kerangka (`Skeleton`) berbentuk konten sebenarnya, bukan spinner kosong. **Kosong:** ikon bulat + judul + satu kalimat + satu tombol. **Gagal:** `Alert` error dengan penjelasan dan tombol "Coba lagi".
- **Kartu onboarding** di dashboard untuk pengguna baru: tiga langkah (tukar kode, buat skripsi, unggah dan cek), langkah aktif disorot dengan satu tombol, hilang saat semua selesai.

## 8. Tata letak

### 8.1 Landing page (referensi Cloud)

1. **Hero dua kolom** di `gradient-hero`, diakhiri kurva gelombang. Navbar: logo, menu (Fitur, Laporan, Cara Kerja, Paket, FAQ), tombol putih "Masuk". Kiri: pill sambutan "Khusus undangan", judul besar dengan kata sorotan `accent-300`, paragraf, tombol Mint + Outline terang, dan kotak input kode. Kanan: mockup ponsel di depan, panel desktop di belakang.
2. **Tiga kartu fitur**, kartu tengah solid `gradient-hero`, diapit dua kartu putih.
3. **Showcase dua kolom:** mockup laporan di kiri, penjelasan dan poin centang di kanan.
4. **Alur kerja:** tiga langkah bernomor, kartu aktif berwarna.
5. **Harga:** kiri penjelasan dan metode pembayaran (dibayar langsung ke pemilik), kanan dua kartu: Trial dan Paket Skripsi dengan lencana "Paling populer". Angka diambil dari pengaturan admin, tidak ditulis di kode.
6. **Banner CTA lebar** di `gradient-hero`: widget skor di kiri, ajakan dan input kode di kanan.
7. **FAQ** akordeon, lalu **footer** multi-kolom.

### 8.2 Masuk dan tukar kode

Langkah 1 kode akses, langkah 2 tombol "Lanjut dengan Google" (putih, border `ink-200`, logo Google resmi: satu-satunya pengecualian aturan ikon). Pengguna lama langsung "Masuk dengan Google". Akun tanpa profil melihat halaman tukar kode: "Skrippy khusus undangan. Masukkan kode akses dari pemilik."

### 8.3 Dashboard (referensi Donezo)

- **Sidebar** (lebar 248 px, panel putih `radius-xl`, mengambang di dalam kanvas): logo, grup **MENU** (Dashboard, Skripsi saya, Riwayat cek, Akses), grup **UMUM** (Panel admin untuk superadmin, Keluar). Item aktif: `primary-50`, teks `primary-700`, garis kiri 3 px `primary-500`. Di bawah: kartu gelap ajakan ("Butuh kode atau paket?" + tombol "Hubungi pemilik").
- **Bilah atas:** kartu putih `radius-xl` berisi judul halaman, chip status akses, avatar, nama, dan email.
- **Kepala halaman:** judul "Dashboard", subjudul "Periksa naskahmu dan pantau skornya.", tombol primer "Unggah naskah" dan tombol outline "Tukar kode".
- **Baris statistik (4 kartu):** Skor terakhir (solid hijau), Temuan di cek terakhir, Cek dijalankan, Sisa akses.
- **Baris tengah:** "Skor per versi" (batang pil), "Status akses" (kartu pengingat dengan tombol), "Skripsi saya" (daftar).
- **Baris bawah:** "Cek terbaru" (daftar dengan chip status), "Skor per kategori" (setengah lingkaran), kartu gelap "Sisa waktu akses".
- **Ponsel:** navigasi bawah lima item, kartu menumpuk satu kolom, bilah atas menyusut menjadi judul + avatar.
- Halaman lain (skripsi, unggah, laporan, akses, admin) memakai cangkang yang sama.

### 8.4 Panel admin

Ringkasan (kartu statistik), Kode akses (buat, daftar, cabut, salin kode dan pesan WhatsApp), Pengguna (perpanjang, hentikan, wajib beralasan), Pengaturan. Contoh pesan WhatsApp siap kirim:

```
Halo Rina, ini kode akses Skrippy kamu:

SKR-7K2P-9QXM

Jenis: Paket Skripsi (30 hari, cek tanpa batas)
Pakai sebelum: 3 November 2026
Buka: https://skrippy.id/masuk?kode=SKR-7K2P-9QXM

Semoga lancar skripsinya!
```

## 9. Gerak

150 ms untuk hover dan fokus, 220 ms buka tutup panel, 320 ms transisi halaman. Easing `cubic-bezier(0.2, 0.8, 0.2, 1)`. Kartu muncul naik 12 px + fade sekali. Hormati `prefers-reduced-motion`.

## 10. Aksesibilitas

Kontras teks minimal 4,5:1 (teks besar 3:1); teks putih di atas `primary-500` memenuhi untuk 15 px ke atas. Semua elemen interaktif bisa diakses keyboard dengan cincin fokus. Target sentuh minimal 44 x 44 px. Keparahan dan status selalu simbol + label. Status pemeriksaan memakai `aria-live="polite"`. Grafik punya nilai teks. Gambar dekoratif `alt=""`.

## 11. Gaya bahasa

- Bahasa Indonesia, menyapa dengan **"kamu"**, santai tapi sopan.
- Kalimat pendek dan langsung: "Margin kiri 3 cm, seharusnya 4 cm."
- Pesan error menjelaskan apa yang terjadi dan apa yang bisa dilakukan: "File ini terkunci kata sandi. Buka kuncinya di Word, lalu unggah lagi."
- Hindari menakut-nakuti: "perlu diperbaiki", bukan "salah fatal".
- Tombol memakai kata kerja: "Unggah naskah", "Jalankan cek", "Tukar kode".
- Angka format Indonesia: Rp25.000, 1,5 spasi. Harga dan durasi selalu dari pengaturan, bukan ditulis tetap.
- Semua teks UI lewat `src/lib/i18n/id.ts`.

## 12. Token untuk Tailwind

Tailwind v4: token dipetakan di blok `@theme inline` pada `src/styles/tokens.css` (`primary-*`, `accent-*`, `ink-*`, `sev-*`, `canvas`, `surface`, radius, bayangan, font). Komponen memakai kelas seperti `bg-primary-500`, `text-ink-900`, `rounded-xl`, `shadow-md`; tidak ada hex di komponen.

## 13. Aturan UX

### 13.1 Memilih pola umpan balik

| Peristiwa | Pola | Contoh |
|---|---|---|
| Hasil tindakan berhasil | Toast berhasil | "Skripsi dibuat." |
| Hasil tindakan gagal (tanpa form) | Toast kesalahan | "Cek gagal karena kesalahan sistem. Jatah kamu tidak terpakai." |
| Input form tidak valid | Pesan inline di bawah kolom + `aria-invalid` | "Judul skripsi wajib diisi." |
| Gagal memuat halaman atau data | `Alert` error + "Coba lagi" | "Dashboard tidak bisa dimuat." |
| Perlu input singkat | Modal formulir | Buat skripsi, perpanjang akses |
| Tindakan merusak atau tak bisa dibatalkan | Dialog konfirmasi | Hapus versi, hapus akun, cabut kode |
| Status yang perlu tindakan terus-menerus | Banner | Akses hampir habis |
| Proses berjalan di latar | Stepper + `aria-live` | Antre, Diperiksa, Selesai |
| Informasi yang hanya dibutuhkan sekali | Modal dengan peringatan | Kode akses baru ("hanya ditampilkan sekali") |

Aturan umum: satu peristiwa satu pola (jangan toast **dan** alert untuk hal yang sama), jangan toast untuk hal yang pengguna lihat langsung terjadi di layar, dan jangan modal untuk informasi yang bisa inline.

### 13.2 Alur masuk dan sesi

1. Halaman masuk dua panel (panel merek di kiri pada layar lebar). Dua jalur lewat tab: **Punya kode** (kode divalidasi langsung, lalu tombol Google) dan **Sudah punya akun** (langsung tombol Google).
2. Tombol Google memakai logo resmi, menampilkan "Mengalihkan ke Google..." dan nonaktif selama proses.
3. Setelah masuk: ada kode -> tukar otomatis (kerangka "Memeriksa kode..."), tujuan semula (`next`) -> ke sana, lainnya -> dashboard. Akun tanpa profil diarahkan ke halaman tukar kode.
4. Galat masuk ditampilkan sebagai `Alert` yang spesifik: izin Google dibatalkan, gagal masuk, sesi berakhir. Tidak pernah halaman kosong.
5. **Sesi berakhir** di mana pun (respons 401): toast peringatan "Sesi berakhir", lalu ke halaman masuk membawa tujuan semula.
6. **Koneksi terputus**: toast peringatan tetap tampil sampai tersambung, lalu toast berhasil singkat.
7. **Keluar**: toast "Kamu sudah keluar." dan kembali ke landing. Hapus akun lewat dialog konfirmasi di halaman Akses.

### 13.3 Form dan validasi

- Label selalu terlihat di atas kolom, bukan hanya placeholder. Petunjuk format di bawah kolom, diganti pesan error saat ada.
- Validasi saat kirim, dan **langsung** untuk format yang jelas (kode akses: ikon centang saat lengkap, "8 karakter" saat sebagian).
- Error menyebut apa yang salah dan cara memperbaikinya. Error hilang begitu pengguna mengetik.
- Batas kolom memakai `ink-400` (kontras 4,9:1). Tombol kirim menampilkan loading dan nonaktif agar tidak terkirim ganda.
- Kolom wajib ditandai lewat pesan, bukan tanda bintang. Kolom opsional diberi keterangan "opsional".

### 13.4 Keyboard dan fokus

- Semua tindakan bisa dicapai dengan keyboard; urutan tab mengikuti urutan visual. Tautan "Lewati ke konten utama" muncul saat difokuskan.
- Cincin fokus 3 px `primary-200` selalu terlihat. Modal mengunci fokus dan mengembalikannya. Menu memakai panah dan Esc. Tab kategori laporan memakai `role="tablist"`.
- Target sentuh minimal 44 x 44 px, jarak antar-target cukup agar tidak salah ketuk.

### 13.5 Ponsel (360 px)

- Satu kolom, tanpa luapan horizontal. Navigasi bawah lima item; modal sebagai lembar dari bawah; bilah filter laporan menempel dan bisa digeser.
- Teks panjang (judul skripsi, nama berkas) dipotong dengan elipsis di kartu dan lengkap di halaman detail.
- Toast di atas agar tidak tertutup navigasi bawah.

### 13.6 Gerak

- Masuk: modal naik 12 px + memudar 200 ms, toast naik + memudar 320 ms. Angka dan cincin skor terisi 800 ms. Semua nonaktif saat `prefers-reduced-motion`.
- Tidak ada animasi yang menghalangi: pengguna bisa menekan tombol sebelum animasi selesai.

### 13.7 Mikrokopi

- Tombol memakai kata kerja spesifik ("Hapus versi", "Jalankan cek"), bukan "OK" atau "Ya".
- Pesan kesalahan tidak menyalahkan pengguna dan tidak menampilkan kode teknis. Bila perlu rujukan, tampilkan `ref:` kecil di halaman error.
- Konfirmasi merusak menyebut apa yang hilang dan apa yang tetap ada ("Skor dan jumlah temuan tetap ada di riwayat").
- Kondisi kosong menjelaskan apa gunanya fitur itu dan memberi satu langkah berikutnya.
