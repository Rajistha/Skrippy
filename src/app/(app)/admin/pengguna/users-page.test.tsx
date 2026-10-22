// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";
import type { AdminUser } from "@/lib/schemas";
import AdminUsersPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/pengguna",
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));
const SELF = "99999999-9999-4999-8999-999999999999";
vi.mock("@/lib/session", () => ({
  useSession: () => ({
    me: {
      profile: {
        id: SELF,
        email: "pujarajista@gmail.com",
        full_name: "Puja",
        avatar_url: null,
        role: "superadmin",
      },
      access: {
        state: "package",
        ends_at: null,
        days_left: 99999,
        checks_left: null,
        daily_limit: 1000,
      },
    },
    refresh: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const mk = (id: string, over: Partial<AdminUser>): AdminUser => ({
  id,
  email: `${id}@mail.id`,
  full_name: null,
  role: "user",
  is_owner: false,
  created_at: "2026-10-11T01:00:00Z",
  thesis_title: null,
  access: { state: "none", ends_at: null, days_left: null, checks_left: null, daily_limit: null },
  checks_used: 0,
  ...over,
});

const USERS: AdminUser[] = [
  mk("turah", {
    email: "turahguntur3@gmail.com",
    full_name: "I Gusti Ngurah",
    role: "superadmin",
    created_at: "2026-10-14T01:00:00Z",
    thesis_title: "Turah & Niti",
    access: {
      state: "package",
      ends_at: null,
      days_left: 99999,
      checks_left: null,
      daily_limit: 1000,
    },
  }),
  mk("dummy", {
    email: "test.dummy99033@gmail.com",
    created_at: "2026-10-14T00:00:00Z",
    thesis_title: "DEM & PET",
    access: {
      state: "expired",
      ends_at: null,
      days_left: null,
      checks_left: null,
      daily_limit: null,
    },
  }),
  mk("rajistha", {
    email: "rajistha.id@gmail.com",
    full_name: "rajistha",
    created_at: "2026-10-11T00:00:00Z",
    checks_used: 7,
  }),
  mk(SELF, {
    email: "pujarajista@gmail.com",
    full_name: "Puja Rajistha",
    role: "superadmin",
    is_owner: true,
    created_at: "2026-10-09T01:00:00Z",
    thesis_title: "Rajistha & Sadiva",
    access: {
      state: "package",
      ends_at: null,
      days_left: 99999,
      checks_left: null,
      daily_limit: 1000,
    },
  }),
];

type Call = { url: string; method: string };
let calls: Call[] = [];
beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response(JSON.stringify(USERS));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = () =>
  render(
    <ToastProvider>
      <AdminUsersPage />
    </ToastProvider>,
  );
const emails = () =>
  screen.getAllByRole("listitem").map((li) => li.querySelector("span.truncate")?.textContent);

describe("halaman pengguna", () => {
  it("baris berisi email, label admin, nama, tanggal daftar, skripsi, dan label akses", async () => {
    mount();
    expect(await screen.findByText("turahguntur3@gmail.com")).toBeTruthy();
    expect(
      screen.getByText(/I Gusti Ngurah · daftar 14 Oktober 2026 · skripsi: Turah & Niti/),
    ).toBeTruthy();
    expect(screen.getByText(/daftar 11 Oktober 2026 · skripsi: -/)).toBeTruthy();
    expect(screen.getAllByText("Selamanya")).toHaveLength(2);
    expect(screen.getByText("Berakhir")).toBeTruthy();
    expect(screen.getByText("Belum ada akses")).toBeTruthy();
    expect(screen.getByText("admin")).toBeTruthy();
    expect(screen.getByText("pemilik")).toBeTruthy();
  });

  it("urutan bawaan: terbaru mendaftar dulu; bisa diubah ke email dan menaik", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("turahguntur3@gmail.com");
    const byJoin = emails();
    expect(byJoin[0]).toBe("turahguntur3@gmail.com"); // 14 Okt 01:00 paling baru
    expect(byJoin[3]).toBe("pujarajista@gmail.com");
    await user.selectOptions(screen.getByLabelText("Urutkan"), "email");
    await user.click(screen.getByRole("button", { name: /Urutan menurun/ }));
    expect(emails()).toEqual([
      "pujarajista@gmail.com",
      "rajistha.id@gmail.com",
      "test.dummy99033@gmail.com",
      "turahguntur3@gmail.com",
    ]);
  });

  it("pencarian menurut email atau nama", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("turahguntur3@gmail.com");
    await user.type(screen.getByPlaceholderText("Cari email"), "dummy");
    expect(emails()).toEqual(["test.dummy99033@gmail.com"]);
    await user.clear(screen.getByPlaceholderText("Cari email"));
    await user.type(screen.getByPlaceholderText("Cari email"), "puja");
    expect(emails()).toEqual(["pujarajista@gmail.com"]);
    await user.clear(screen.getByPlaceholderText("Cari email"));
    await user.type(screen.getByPlaceholderText("Cari email"), "tidak-ada");
    expect(screen.getByText("Tidak ada pengguna yang cocok.")).toBeTruthy();
  });

  it("ikon hapus tidak ada untuk akun sendiri dan pemilik; ada untuk pengguna lain termasuk admin lain", async () => {
    mount();
    await screen.findByText("turahguntur3@gmail.com");
    expect(screen.getAllByRole("button", { name: /^Hapus akun:/ })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Hapus akun: pujarajista@gmail.com" })).toBeNull();
    expect(screen.getByRole("button", { name: "Hapus akun: turahguntur3@gmail.com" })).toBeTruthy();
  });

  it("hapus akun: konfirmasi dulu, lalu DELETE dan daftar dimuat ulang", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Hapus akun: rajistha.id@gmail.com" }),
    );
    expect(await screen.findByText("Hapus akun ini permanen?")).toBeTruthy();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Hapus akun" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/users/rajistha"))).toBe(
        true,
      ),
    );
  });

  it("ikon atur membuka satu modal Kelola pengguna dengan nama dan email", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Atur akun: rajistha.id@gmail.com" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Kelola pengguna")).toBeTruthy();
    expect(within(dialog).getByText("rajistha · rajistha.id@gmail.com")).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Peran akun" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Akses aplikasi" })).toBeTruthy();
  });
});
