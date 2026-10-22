/** Penjelasan tiap aturan: mengapa diperiksa dan cara memperbaikinya di Microsoft Word. */
export type RuleHelp = { why: string; how: string };

export const RULE_HELP: Record<string, RuleHelp> = {
  "FMT-001": {
    why: "Pedoman kampus menetapkan ukuran kertas yang seragam untuk seluruh naskah.",
    how: "Layout > Size, pilih ukuran yang diminta pedoman (biasanya A4), lalu terapkan ke seluruh dokumen.",
  },
  "FMT-002": {
    why: "Margin yang salah membuat halaman tidak sesuai ketentuan jilid dan cetak.",
    how: "Layout > Margins > Custom Margins, isi atas, bawah, kiri, kanan sesuai pedoman, dan pilih Apply to: Whole document.",
  },
  "FMT-003": {
    why: "Jenis huruf isi harus seragam sesuai pedoman.",
    how: "Pilih paragraf isi, lalu Home > Font dan ubah jenis huruf. Lebih rapi bila diatur lewat style Normal.",
  },
  "FMT-004": {
    why: "Ukuran huruf isi harus seragam sesuai pedoman.",
    how: "Pilih paragraf isi, lalu Home > Font Size. Atur sekali lewat style Normal agar berlaku di semua paragraf.",
  },
  "FMT-005": {
    why: "Spasi baris isi diatur pedoman agar naskah mudah dibaca dan dikoreksi.",
    how: "Pilih paragraf, Home > Line and Paragraph Spacing > Line Spacing Options, atur Line spacing (misal 1,5 lines).",
  },
  "FMT-006": {
    why: "Baris pertama setiap paragraf diberi indentasi seragam.",
    how: "Home > Paragraph (peluncur dialog), bagian Special, pilih First line dan isi ukuran sesuai pedoman.",
  },
  "FMT-007": {
    why: "Pedoman biasanya meminta paragraf rata kiri kanan agar tepi teks rapi.",
    how: "Pilih paragraf lalu tekan Ctrl+J (Justify).",
  },
  "FMT-008": {
    why: "Judul bab harus seragam: format penomoran, huruf kapital, posisi, dan ketebalan.",
    how: "Atur sekali lewat style Heading 1 (klik kanan style > Modify), lalu terapkan ke semua judul bab.",
  },
  "FMT-009": {
    why: "Halaman awal memakai angka Romawi kecil, isi naskah mulai Bab I memakai angka Arab.",
    how: "Pisahkan bagian dengan Layout > Breaks > Next Page. Lalu Insert > Page Number > Format Page Numbers pada tiap bagian, dan matikan Link to Previous di footer.",
  },
  "FMT-010": {
    why: "Posisi caption tabel dan gambar diatur pedoman.",
    how: "Pindahkan paragraf caption ke atas atau bawah objek sesuai pedoman. Gunakan References > Insert Caption agar konsisten.",
  },
  "FMT-011": {
    why: "Nomor caption yang melompat atau berulang membingungkan pembaca.",
    how: "Pakai References > Insert Caption supaya nomor otomatis, lalu tekan Ctrl+A dan F9 untuk memperbarui semua nomor.",
  },
  "FMT-012": {
    why: "Judul subbab harus seragam dalam ketebalan dan penulisan huruf kapital.",
    how: "Atur lewat style Heading 2 dan Heading 3 (klik kanan style > Modify), lalu terapkan ke judul subbab.",
  },
  "FMT-013": {
    why: "Daftar pustaka umumnya memakai spasi 1 agar ringkas.",
    how: "Pilih seluruh entri daftar pustaka, Home > Line and Paragraph Spacing > 1,0.",
  },
  "FMT-014": {
    why: "Potongan teks dengan jenis huruf berbeda biasanya sisa hasil salin dari sumber lain.",
    how: "Pilih teks yang dimaksud lalu pakai Home > Font untuk menyamakan, atau Ctrl+Spasi untuk menghapus format manual.",
  },
  "FMT-015": {
    why: "Entri daftar pustaka memakai indentasi gantung: baris kedua dan seterusnya menjorok.",
    how: "Pilih entri daftar pustaka, Home > Paragraph, bagian Special pilih Hanging dan isi 1,25 cm.",
  },
  "FMT-016": {
    why: "Halaman judul harus lengkap: logo, judul, nama, NIM, institusi, dan tahun.",
    how: "Lengkapi unsur yang disebut di temuan. Logo disisipkan lewat Insert > Pictures.",
  },
  "FMT-017": {
    why: "Teks merujuk tabel atau gambar yang tidak ada atau nomornya salah.",
    how: "Periksa nomor yang dirujuk. Lebih aman memakai References > Cross-reference agar nomor ikut berubah otomatis.",
  },
  "FMT-018": {
    why: "Setiap tabel dan gambar perlu dibahas atau disebut di teks.",
    how: 'Tambahkan kalimat yang menyebut objek tersebut, misalnya "Hasil pengukuran ditunjukkan pada Tabel 4.2".',
  },
  "FMT-019": {
    why: "Tabel atau gambar yang melewati margin terpotong saat dicetak.",
    how: "Klik objek, tarik pojoknya, atau untuk tabel: Layout > AutoFit > AutoFit to Window.",
  },
  "FMT-020": {
    why: "Gambar tanpa caption tidak bisa dirujuk dan tidak masuk daftar gambar.",
    how: "Klik gambar lalu References > Insert Caption, pilih label Gambar.",
  },
  "FMT-021": {
    why: "Tabel tanpa caption tidak bisa dirujuk dan tidak masuk daftar tabel.",
    how: "Klik tabel lalu References > Insert Caption, pilih label Tabel.",
  },
  "FMT-022": {
    why: "Persamaan yang dirujuk di teks harus bernomor.",
    how: "Beri nomor di tepi kanan, misalnya (2.1), dengan tab rata kanan atau tabel tanpa garis.",
  },
  "FMT-023": {
    why: "Perubahan terlacak dan komentar yang tersisa tidak layak dikumpulkan.",
    how: "Review > Accept > Accept All Changes, lalu Review > Delete > Delete All Comments in Document.",
  },
  "FMT-024": {
    why: "Header yang hanya ada di sebagian bagian membuat tampilan antarhalaman tidak seragam.",
    how: "Klik dua kali area header, lalu samakan isinya. Matikan Link to Previous bila tiap bagian memang berbeda.",
  },
  "FMT-025": {
    why: "Gaya sitasi nama-tahun atau bernomor tidak memakai catatan kaki untuk rujukan.",
    how: "Hapus catatan kaki rujukan dan tulis sitasi di dalam teks. Catatan kaki penjelas boleh bila pedoman mengizinkan.",
  },
  "FMT-026": {
    why: "Properti dokumen yang kosong menyulitkan identifikasi file.",
    how: "File > Info > Properties > Advanced Properties, isi Title dan Author.",
  },
  "FMT-027": {
    why: "Teks alternatif membuat gambar bisa dipahami pembaca layar dan tetap bermakna bila gambar gagal tampil.",
    how: "Klik kanan gambar, pilih View Alt Text, lalu tulis satu atau dua kalimat yang menjelaskan isi gambar.",
  },
  "FMT-028": {
    why: "Baris judul yang ditandai terulang di setiap halaman saat tabel panjang dan mempermudah pembacaan.",
    how: "Pilih baris pertama tabel, Table Layout > Repeat Header Rows.",
  },
  "FMT-029": {
    why: "Huruf di dalam tabel sebaiknya seragam dengan isi naskah.",
    how: "Pilih seluruh tabel (ikon di pojok kiri atas), lalu atur jenis dan ukuran huruf di Home > Font.",
  },
  "STR-001": {
    why: "Pedoman mewajibkan bagian tertentu ada di setiap naskah.",
    how: "Tambahkan bagian yang disebut di temuan dengan judul yang sama persis dengan pedoman.",
  },
  "STR-002": {
    why: "Urutan bagian naskah diatur pedoman.",
    how: "Pindahkan bagian ke urutan yang benar. Gunakan Navigation Pane (View > Navigation Pane) lalu seret judulnya.",
  },
  "STR-003": {
    why: "Daftar isi harus mencerminkan judul bab dan subbab terbaru.",
    how: "Klik daftar isi lalu Update Table (F9), pilih Update entire table.",
  },
  "STR-004": {
    why: "Penomoran subbab harus runtut dan bertingkat (1.1, 1.2, 1.2.1).",
    how: "Periksa nomor yang melompat. Pakai Multilevel List agar penomoran otomatis.",
  },
  "STR-005": {
    why: "Abstrak harus berada dalam batas panjang yang ditentukan pedoman.",
    how: "Ringkas atau lengkapi abstrak. Hitung jumlah kata lewat Review > Word Count dengan menyeleksi abstrak.",
  },
  "STR-006": {
    why: "Bab yang sangat pendek atau kosong biasanya belum selesai ditulis.",
    how: "Lengkapi isi bab, atau periksa apakah teksnya tidak sengaja terhapus.",
  },
  "STR-007": {
    why: "Pedoman menetapkan subbab tertentu di bab tertentu.",
    how: "Tambahkan subbab yang disebut di temuan sebagai judul (Heading 2) di bab terkait.",
  },
  "STR-008": {
    why: "Daftar tabel atau gambar harus sama dengan caption yang ada di naskah.",
    how: "References > Insert Table of Figures, lalu perbarui dengan F9 setelah mengubah caption.",
  },
  "STR-009": {
    why: "Judul subbab tanpa isi menandakan bagian yang terlewat.",
    how: "Isi subbab atau hapus judulnya.",
  },
  "STR-010": {
    why: "Daftar isi manual mudah tidak cocok dengan isi naskah.",
    how: "References > Table of Contents > Automatic Table. Pastikan judul memakai style Heading 1 sampai 3.",
  },
  "STR-011": {
    why: "Bab Metode Penelitian umumnya menyebut populasi atau sampel, instrumen, dan teknik analisis.",
    how: "Tambahkan penjelasan unsur yang disebut di temuan. Abaikan temuan ini bila penelitianmu memang tidak memerlukannya.",
  },
  "STR-012": {
    why: "Setiap rumusan masalah semestinya terjawab di pembahasan dan kesimpulan.",
    how: "Pastikan Bab IV dan V membahas tiap rumusan masalah dengan istilah yang sama.",
  },
  "STR-013": {
    why: "Paragraf yang hampir sama muncul dua kali, biasanya akibat salin-tempel tanpa sengaja.",
    how: "Tulis ulang salah satunya, atau hapus bila hanya duplikat.",
  },
  "EJA-001": {
    why: "Kata tidak baku tidak sesuai KBBI.",
    how: "Ganti dengan bentuk baku yang disarankan. Gunakan Find and Replace (Ctrl+H) untuk kemunculan berulang.",
  },
  "EJA-002": {
    why: 'Kata depan "di" dan "ke" ditulis terpisah, sedangkan awalan di- ditulis serangkai.',
    how: 'Tulis terpisah untuk keterangan tempat ("di rumah"), serangkai untuk kata kerja ("dibaca").',
  },
  "EJA-003": {
    why: "Spasi ganda merusak perataan teks.",
    how: "Ctrl+H, cari dua spasi, ganti dengan satu spasi, ulangi sampai tidak ada yang diganti.",
  },
  "EJA-004": {
    why: "Tanda baca menempel pada kata sebelumnya dan diikuti spasi.",
    how: "Hapus spasi sebelum tanda baca dan beri satu spasi sesudahnya.",
  },
  "EJA-005": {
    why: "Kalimat diawali huruf kapital.",
    how: "Ubah huruf pertama kalimat menjadi kapital (Shift+F3 membantu mengubah kapitalisasi).",
  },
  "EJA-006": {
    why: "Istilah asing dicetak miring.",
    how: "Pilih istilahnya lalu Ctrl+I.",
  },
  "EJA-007": {
    why: "Kata yang sama tertulis dua kali berurutan, biasanya salah ketik.",
    how: "Hapus salah satunya. Untuk kata ulang gunakan tanda hubung (anak-anak).",
  },
  "EJA-008": {
    why: "Kurung atau tanda kutip yang tidak berpasangan membuat kalimat tidak jelas batasnya.",
    how: "Cari pasangan yang hilang dan tambahkan, atau hapus tanda yang berlebih.",
  },
  "EJA-009": {
    why: "Angka dan satuan ditulis dengan spasi di antaranya.",
    how: 'Beri spasi, misalnya "50 kg". Tekan Ctrl+Shift+Spasi agar tidak terpisah antarbaris.',
  },
  "EJA-010": {
    why: "Kalimat yang terlalu panjang sulit dipahami.",
    how: "Pecah kalimat di kata sambung (dan, yang, sehingga) menjadi dua kalimat atau lebih.",
  },
  "EJA-011": {
    why: "Istilah yang sama sebaiknya ditulis dengan satu bentuk di seluruh naskah.",
    how: "Pilih satu bentuk lalu gunakan Find and Replace (Ctrl+H) untuk menyeragamkan.",
  },
  "EJA-012": {
    why: "Singkatan dijelaskan saat pertama kali muncul, lalu dipakai konsisten.",
    how: 'Tulis kepanjangannya diikuti singkatan dalam kurung: "Enterprise Resource Planning (ERP)".',
  },
  "SIT-001": {
    why: "Setiap sitasi di teks harus punya entri di daftar pustaka.",
    how: "Tambahkan sumber ke daftar pustaka, atau perbaiki nama dan tahun pada sitasi.",
  },
  "SIT-002": {
    why: "Sumber di daftar pustaka harus pernah disitasi di teks.",
    how: "Sitasi sumber itu di bagian yang relevan, atau hapus dari daftar pustaka.",
  },
  "SIT-003": {
    why: "Daftar pustaka gaya APA diurutkan alfabet.",
    how: "Pilih seluruh entri lalu Home > Sort (ikon A-Z), Sort by Paragraphs, Ascending.",
  },
  "SIT-004": {
    why: "Tahun pada sitasi harus sama dengan tahun di daftar pustaka.",
    how: "Periksa tahun terbit sumber aslinya, lalu samakan di kedua tempat.",
  },
  "SIT-005": {
    why: "Sumber yang terlalu lama kurang mencerminkan perkembangan terbaru.",
    how: "Tambahkan sumber lima sampai sepuluh tahun terakhir. Sumber klasik boleh dipertahankan bila memang rujukan utama.",
  },
  "SIT-006": {
    why: "Entri daftar pustaka APA mengikuti pola tetap: Nama, Inisial. (Tahun). Judul. Penerbit.",
    how: "Susun ulang entri sesuai pola. Bila sumber memang lembaga, tulis nama lembaga lalu (Tahun).",
  },
  "SIT-007": {
    why: "Satu naskah memakai satu gaya sitasi.",
    how: "Ubah semua sitasi ke gaya yang ditetapkan pedoman (APA: nama dan tahun, IEEE: nomor).",
  },
  "SIT-008": {
    why: 'Singkatan "dkk." atau "et al." hanya untuk sumber dengan tiga penulis atau lebih.',
    how: "Untuk dua penulis, sebut keduanya: (Adams & Lee, 2020).",
  },
  "SIT-009": {
    why: "Entri yang sama tidak perlu ditulis dua kali.",
    how: "Hapus salah satu entri.",
  },
  "SIT-010": {
    why: "Artikel jurnal sebaiknya mencantumkan DOI atau URL agar mudah ditelusuri.",
    how: "Cari DOI di halaman artikel atau lewat crossref.org lalu tambahkan di akhir entri.",
  },
  "SIT-011": {
    why: "Kutipan langsung perlu nomor halaman agar bisa diverifikasi.",
    how: "Tambahkan halaman: (Adams, 2020, hlm. 15).",
  },
  "AI-001": {
    why: "Analisis AI menemukan kemungkinan kesalahan tata bahasa atau ejaan.",
    how: "Baca kalimatnya dan terapkan saran bila benar. AI bisa keliru, jadi tetap pakai penilaianmu.",
  },
  "AI-002": {
    why: "Rumusan masalah, tujuan, dan kesimpulan semestinya saling menjawab.",
    how: "Samakan isi ketiganya: tiap rumusan punya tujuan dan jawaban di kesimpulan.",
  },
  "AI-003": {
    why: "Kalimat yang tidak efektif membuat maksud sulit ditangkap.",
    how: "Ringkas kalimat dan pastikan subjek serta predikatnya jelas.",
  },
  "AI-004": {
    why: "Kalimat ambigu atau tidak lengkap bisa ditafsirkan berbeda oleh penguji.",
    how: "Tulis ulang dengan subjek, predikat, dan objek yang jelas.",
  },
  "AI-005": {
    why: "Klaim faktual, angka, atau pernyataan umum perlu didukung rujukan.",
    how: "Tambahkan sitasi sumber yang mendukung klaim itu, atau ubah menjadi pendapatmu sendiri.",
  },
  "AI-006": {
    why: "Abstrak yang baik memuat latar, tujuan, metode, hasil, dan simpulan.",
    how: "Tambahkan unsur yang hilang dengan satu atau dua kalimat per unsur.",
  },
  "AI-009": {
    why: "Entri daftar pustaka perlu memuat penulis, tahun, judul, dan sumber agar bisa ditelusuri.",
    how: "Lengkapi unsur yang disebut di temuan dari halaman sumbernya, lalu samakan polanya dengan entri lain.",
  },
  "AI-007": {
    why: "Metode harus sesuai dengan tujuan, dan pembahasan harus menjelaskan hasil.",
    how: "Periksa kembali kaitan antara tujuan, metode, dan hasil, lalu jelaskan hubungannya secara eksplisit.",
  },
};

export function ruleHelp(code: string): RuleHelp | null {
  return RULE_HELP[code] ?? null;
}
