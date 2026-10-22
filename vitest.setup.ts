import "@testing-library/jest-dom/vitest";

// Nilai palsu hanya untuk tes. Tidak ada secret asli di sini.
Object.assign(process.env, {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key-not-real",
  SUPABASE_STORAGE_BUCKET: "manuscripts",
  ACCESS_CODE_HMAC_SECRET: "test-secret-do-not-use",
  CRON_SECRET: "test-cron-secret-not-real",
  SUPERADMIN_EMAIL: "owner@example.com",
  APP_BASE_URL: "http://localhost:3000",
  FILE_RETENTION_DAYS: "30",
  MAX_UPLOAD_MB: "25",
});

// jsdom belum mengimplementasikan <dialog>.showModal/close. Tiruan sederhana yang meniru perilaku
// pentingnya: atribut `open` dan event `close`.
if (typeof HTMLDialogElement !== "undefined") {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (!proto.showModal) {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    proto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}
