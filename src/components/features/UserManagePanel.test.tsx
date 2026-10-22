// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";
import type { AdminUser } from "@/lib/schemas";
import { ManagePanel, UserAccessPill } from "./UserManagePanel";

const user = (over: Partial<AdminUser> = {}): AdminUser => ({
  id: "11111111-1111-4111-8111-111111111111",
  email: "rajistha.id@gmail.com",
  full_name: "rajistha",
  role: "user",
  is_owner: false,
  created_at: "2026-10-11T01:00:00Z",
  thesis_title: null,
  access: {
    state: "package",
    ends_at: "2026-11-20T00:00:00Z",
    days_left: 30,
    checks_left: null,
    daily_limit: 20,
  },
  checks_used: 0,
  ...over,
});

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let failNext: Response | null = null;

beforeEach(() => {
  calls = [];
  failNext = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(init.body as string) : null,
      });
      if (failNext) return failNext;
      return url.endsWith("/role")
        ? new Response(JSON.stringify({ role: "superadmin" }))
        : new Response(null, { status: 204 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const onChanged = vi.fn(async () => undefined);
const mount = (u: AdminUser, isSelf = false) =>
  render(
    <ToastProvider>
      <ManagePanel user={u} isSelf={isSelf} onChanged={onChanged} />
    </ToastProvider>,
  );

describe("label akses", () => {
  it.each([
    [
      { state: "package", ends_at: null, days_left: 99999, checks_left: null, daily_limit: 20 },
      "Selamanya",
    ],
    [
      { state: "package", ends_at: null, days_left: 30, checks_left: null, daily_limit: 20 },
      "Paket · 30 hari",
    ],
    [
      { state: "trial", ends_at: null, days_left: 5, checks_left: 2, daily_limit: 3 },
      "Trial · 5 hari",
    ],
    [
      { state: "expired", ends_at: null, days_left: null, checks_left: null, daily_limit: null },
      "Berakhir",
    ],
    [
      { state: "none", ends_at: null, days_left: null, checks_left: null, daily_limit: null },
      "Belum ada akses",
    ],
  ] as const)("%j tampil sebagai %s", (access, label) => {
    render(<UserAccessPill user={user({ access: { ...access } })} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});

describe("modal kelola pengguna", () => {
  it("memuat dua bagian: Peran akun dan Akses aplikasi, lengkap dengan label akses saat ini", () => {
    mount(user());
    expect(screen.getByRole("heading", { name: "Peran akun" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Akses aplikasi" })).toBeTruthy();
    expect(screen.getByText("Paket · 30 hari")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Beri akses selamanya/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Beri trial/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cabut akses/ })).toBeTruthy();
    expect((screen.getByLabelText("Peran") as HTMLSelectElement).value).toBe("user");
  });

  it("mengubah peran: tombol Simpan aktif setelah berubah, konfirmasi dulu, lalu POST", async () => {
    const u = userEvent.setup();
    mount(user());
    const save = screen.getByRole("button", { name: "Simpan" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await u.selectOptions(screen.getByLabelText("Peran"), "superadmin");
    expect(save.disabled).toBe(false);
    await u.click(save);
    expect(await screen.findByText("Jadikan admin?")).toBeTruthy();
    expect(calls).toHaveLength(0);
    const dialog = screen.getByRole("dialog");
    await u.click(within(dialog).getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      url: "/api/admin/users/11111111-1111-4111-8111-111111111111/role",
      body: { role: "superadmin" },
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("akun sendiri dan akun pemilik: peran terkunci dengan penjelasan", () => {
    mount(user({ role: "superadmin" }), true);
    expect(screen.getByText("Kamu tidak bisa mengubah peran akunmu sendiri.")).toBeTruthy();
    expect((screen.getByLabelText("Peran") as HTMLSelectElement).disabled).toBe(true);
    cleanup();
    mount(user({ role: "superadmin", is_owner: true }));
    expect(
      screen.getByText("Akun pemilik selalu admin dan tidak bisa diubah dari aplikasi."),
    ).toBeTruthy();
  });

  it("akun admin: bagian akses dinonaktifkan (tidak memakai jatah)", () => {
    mount(user({ role: "superadmin" }));
    expect(
      (screen.getByRole("button", { name: /Beri akses selamanya/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("button", { name: /Beri trial/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole("button", { name: /Cabut akses/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("beri akses selamanya: langsung mengirim kind lifetime", async () => {
    const u = userEvent.setup();
    mount(user());
    await u.click(screen.getByRole("button", { name: /Beri akses selamanya/ }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      url: expect.stringContaining("/grant"),
      body: { kind: "lifetime" },
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("beri trial: hari divalidasi dulu, lalu dikirim", async () => {
    const u = userEvent.setup();
    mount(user());
    const input = screen.getByLabelText("Beri trial (hari)");
    await u.clear(input);
    await u.type(input, "0");
    await u.click(screen.getByRole("button", { name: /Beri trial/ }));
    expect(await screen.findByText("Jumlah hari: isi bilangan bulat 1 sampai 365.")).toBeTruthy();
    expect(calls).toHaveLength(0);
    await u.clear(input);
    await u.type(input, "14");
    await u.click(screen.getByRole("button", { name: /Beri trial/ }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toEqual({ kind: "trial", days: 14 });
  });

  it("galat dari server ditampilkan, bukan diam", async () => {
    failNext = new Response(
      JSON.stringify({ error: { code: "x", message: "Pengguna tidak ditemukan." } }),
      { status: 404 },
    );
    const u = userEvent.setup();
    mount(user());
    await u.click(screen.getByRole("button", { name: /Beri akses selamanya/ }));
    expect(await screen.findByText("Pengguna tidak ditemukan.")).toBeTruthy();
  });

  it("cabut akses: konfirmasi dulu, lalu stop dengan alasan bawaan", async () => {
    const u = userEvent.setup();
    mount(user());
    await u.click(screen.getByRole("button", { name: /Cabut akses/ }));
    expect(await screen.findByText("Cabut akses pengguna?")).toBeTruthy();
    expect(calls).toHaveLength(0);
    const dialog = screen.getByRole("dialog");
    await u.click(within(dialog).getByRole("button", { name: /Cabut akses/ }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      url: expect.stringContaining("/stop"),
      body: { reason: "Dicabut oleh admin" },
    });
  });
});
