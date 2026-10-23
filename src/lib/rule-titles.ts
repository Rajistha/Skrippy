/** Judul singkat tiap aturan, dipakai pemilih aturan sebelum cek dijalankan. Aturan AI tidak termasuk. */
export const RULE_TITLES: Record<string, string> = {
  "FMT-001": "Ukuran kertas",
  "FMT-002": "Margin",
  "FMT-003": "Jenis huruf isi",
  "FMT-004": "Ukuran huruf isi",
  "FMT-005": "Spasi baris",
  "FMT-006": "Indentasi paragraf",
  "FMT-007": "Perataan paragraf",
  "FMT-008": "Format judul bab",
  "FMT-009": "Penomoran halaman",
  "FMT-010": "Posisi caption",
  "FMT-011": "Nomor caption berurutan",
  "FMT-012": "Format judul subbab",
  "FMT-013": "Spasi daftar pustaka",
  "FMT-014": "Huruf campuran dalam paragraf",
  "FMT-015": "Indentasi gantung daftar pustaka",
  "FMT-016": "Kelengkapan halaman judul",
  "FMT-017": "Rujukan tabel atau gambar tanpa caption",
  "FMT-018": "Caption yang tidak dirujuk",
  "FMT-019": "Tabel atau gambar melebihi margin",
  "FMT-020": "Gambar tanpa caption",
  "FMT-021": "Tabel tanpa caption",
  "FMT-022": "Persamaan tanpa nomor",
  "FMT-023": "Komentar dan perubahan terlacak tersisa",
  "FMT-024": "Header antarbagian konsisten",
  "FMT-025": "Catatan kaki",
  "FMT-026": "Properti dokumen",
  "FMT-027": "Teks alternatif gambar",
  "FMT-028": "Baris judul tabel",
  "FMT-029": "Huruf di dalam tabel",
  "STR-001": "Bagian wajib",
  "STR-002": "Urutan bagian",
  "STR-003": "Kesesuaian daftar isi",
  "STR-004": "Penomoran subbab",
  "STR-005": "Panjang abstrak",
  "STR-006": "Panjang bab",
  "STR-007": "Subbab wajib per bab",
  "STR-008": "Daftar tabel dan gambar",
  "STR-009": "Subbab kosong",
  "STR-010": "Daftar isi otomatis",
  "STR-011": "Kelengkapan Bab III",
  "STR-012": "Jejak rumusan masalah",
  "STR-013": "Paragraf salinan",
  "EJA-001": "Kata tidak baku",
  "EJA-002": "Penulisan di dan ke",
  "EJA-003": "Spasi ganda",
  "EJA-004": "Spasi tanda baca",
  "EJA-005": "Huruf kapital awal kalimat",
  "EJA-006": "Istilah asing miring",
  "EJA-007": "Kata berulang",
  "EJA-008": "Kurung, kutip, dan tanda baca ganda",
  "EJA-009": "Spasi angka dan satuan",
  "EJA-010": "Kalimat terlalu panjang",
  "EJA-011": "Konsistensi istilah",
  "EJA-012": "Penggunaan singkatan",
  "SIT-001": "Sitasi tanpa daftar pustaka",
  "SIT-002": "Pustaka tidak disitasi",
  "SIT-003": "Urutan alfabet pustaka",
  "SIT-004": "Tahun sitasi",
  "SIT-005": "Usia sumber",
  "SIT-006": "Format entri pustaka",
  "SIT-007": "Gaya sitasi konsisten",
  "SIT-008": "Penggunaan dkk.",
  "SIT-009": "Entri pustaka ganda",
  "SIT-010": "DOI atau URL artikel",
  "SIT-011": "Halaman pada kutipan langsung",
  "SIT-012": "Nomor sitasi tanpa entri",
  "SIT-013": "Entri bernomor tidak disitasi",
  "SIT-014": "Urutan sitasi bernomor",
  "SIT-015": "Huruf pembeda tahun (2020a, 2020b)",
};

export type RuleCategory = "format" | "structure" | "spelling" | "citation";

const PREFIX: Record<string, RuleCategory> = {
  FMT: "format",
  STR: "structure",
  EJA: "spelling",
  SIT: "citation",
};

export function ruleCategory(code: string): RuleCategory | null {
  return PREFIX[code.slice(0, 3)] ?? null;
}

/** Kode aturan satu kategori, urut. */
export function rulesOf(category: RuleCategory): string[] {
  return Object.keys(RULE_TITLES)
    .filter((c) => ruleCategory(c) === category)
    .sort();
}

/** Aturan yang hanya masuk akal untuk naskah utuh. Dimatikan saat pengguna memeriksa satu bab saja. */
export const WHOLE_DOCUMENT_RULES = [
  "FMT-009",
  "FMT-016",
  "FMT-024",
  "FMT-026",
  "STR-001",
  "STR-002",
  "STR-003",
  "STR-005",
  "STR-007",
  "STR-008",
  "STR-010",
  "STR-012",
  "SIT-001",
  "SIT-002",
  "SIT-003",
  "SIT-004",
  "SIT-005",
];
