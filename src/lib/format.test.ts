import { describe, expect, it } from "vitest";
import { formatBytes, formatCodeInput, formatRupiah, isCodeComplete, whatsappLink } from "./format";

describe("formatCodeInput", () => {
  it("menyisipkan prefiks dan tanda hubung saat mengetik", () => {
    expect(formatCodeInput("a")).toBe("SKR-A");
    expect(formatCodeInput("abcd")).toBe("SKR-ABCD");
    expect(formatCodeInput("abcde")).toBe("SKR-ABCD-E");
    expect(formatCodeInput("abcdefgh")).toBe("SKR-ABCD-EFGH");
  });

  it("menerima tempelan dengan spasi, huruf kecil, atau prefiks lengkap", () => {
    expect(formatCodeInput(" skr abcd efgh ")).toBe("SKR-ABCD-EFGH");
    expect(formatCodeInput("SKR-ABCD-EFGH")).toBe("SKR-ABCD-EFGH");
    expect(formatCodeInput("abcd-efgh")).toBe("SKR-ABCD-EFGH");
  });

  it("mengetik kode lengkap termasuk awalan huruf demi huruf menghasilkan kode yang benar", () => {
    // Meniru kolom: setiap ketukan menambah satu karakter ke teks yang sedang tampil.
    for (const typed of ["SKR-ABCD-EFGH", "skrabcdefgh", "ABCDEFGH", "SKRABCDEFGH"]) {
      let shown = "";
      for (const ch of typed) shown = formatCodeInput(shown + ch);
      expect(shown, typed).toBe("SKR-ABCD-EFGH");
    }
  });

  it("kode yang kebetulan berisi SKR di awal badan tetap utuh bila diketik dengan awalan", () => {
    let shown = "";
    for (const ch of "SKR-SKRA-BCDE") shown = formatCodeInput(shown + ch);
    expect(shown).toBe("SKR-SKRA-BCDE");
    expect(formatCodeInput("SKR-SKRA-BCDE")).toBe("SKR-SKRA-BCDE");
  });

  it("memotong karakter berlebih dan mengosongkan input kosong", () => {
    expect(formatCodeInput("abcdefghXYZ")).toBe("SKR-ABCD-EFGH");
    expect(formatCodeInput("")).toBe("");
  });
});

describe("isCodeComplete", () => {
  it("hanya benar untuk kode lengkap", () => {
    expect(isCodeComplete("SKR-ABCD-EFGH")).toBe(true);
    expect(isCodeComplete("SKR-ABCD-EFG")).toBe(false);
    expect(isCodeComplete("")).toBe(false);
  });
});

describe("format angka", () => {
  it("rupiah memakai titik ribuan tanpa desimal", () => {
    expect(formatRupiah(25000)).toBe("Rp25.000");
  });

  it("ukuran file", () => {
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1,5 MB");
  });

  it("tautan WhatsApp membuang karakter non-angka", () => {
    expect(whatsappLink("+62 812-3456")).toBe("https://wa.me/628123456");
    expect(whatsappLink("62812", "Halo kamu")).toBe("https://wa.me/62812?text=Halo%20kamu");
  });
});
