// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";
import type { BatchDetail, BatchSummary } from "@/lib/schemas";
import BatchDetailPage from "./[id]/page";
import AdminCodesPage from "./page";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/kode",
  useParams: () => ({ id: "11111111-1111-4111-8111-111111111111" }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/session", () => ({
  useSession: () => ({
    me: {
      profile: {
        id: "a",
        email: "admin@x.id",
        full_name: "Admin",
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

const summary = (over: Partial<BatchSummary> = {}): BatchSummary => ({
  id: "11111111-1111-4111-8111-111111111111",
  number: 1,
  note: "promo",
  created_at: "2026-10-21T01:00:00Z",
  total: 10,
  redeemed: 0,
  capacity: 10,
  valid_until: null,
  status: "active",
  ...over,
});

const detail = (): BatchDetail => ({
  batch: summary({ redeemed: 1 }),
  codes: [
    {
      id: "c1",
      code: "SKR-AAAA-1111",
      code_hint: "1111",
      status: "active",
      redemption_count: 0,
      max_redemptions: 1,
      redeemed_by: [],
    },
    {
      id: "c2",
      code: "SKR-BBBB-2222",
      code_hint: "2222",
      status: "used",
      redemption_count: 1,
      max_redemptions: 1,
      redeemed_by: ["rina@mail.id"],
    },
    {
      id: "c3",
      code: null,
      code_hint: "3333",
      status: "active",
      redemption_count: 0,
      max_redemptions: 1,
      redeemed_by: [],
    },
  ].map((c) => ({ ...c, status: c.status as BatchDetail["codes"][number]["status"] })),
});

type Call = { url: string; method: string };
let calls: Call[] = [];
let routes: Record<string, () => Response> = {};

beforeEach(() => {
  calls = [];
  push.mockClear();
  replace.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" });
      const handler = routes[`${init?.method ?? "GET"} ${url}`];
      return handler ? handler() : new Response("{}", { status: 404 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe("halaman daftar batch", () => {
  it("menampilkan batch seperti contoh: nama, catatan, jumlah kode, tertebus, dan status", async () => {
    routes = {
      "GET /api/admin/batches": () =>
        new Response(
          JSON.stringify([
            summary(),
            summary({
              id: "22222222-2222-4222-8222-222222222222",
              number: 2,
              note: null,
              total: 5,
              redeemed: 5,
              capacity: 5,
              status: "used",
              created_at: "2026-10-22T01:00:00Z",
            }),
          ]),
        ),
    };
    mount(<AdminCodesPage />);
    expect(await screen.findByText("Batch 1")).toBeTruthy();
    expect(screen.getByText(/promo · 10 kode · dibuat/)).toBeTruthy();
    expect(screen.getByText("0/10 tertebus")).toBeTruthy();
    expect(screen.getByText("Aktif")).toBeTruthy();
    expect(screen.getByText("Habis")).toBeTruthy();
    const link = screen.getByText("Batch 1").closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/admin/kode/11111111-1111-4111-8111-111111111111");
  });

  it("urutan bawaan terbaru dulu; ubah ke menaik dan urut berdasarkan tertebus", async () => {
    routes = {
      "GET /api/admin/batches": () =>
        new Response(
          JSON.stringify([
            summary({
              id: "11111111-1111-4111-8111-111111111111",
              number: 1,
              created_at: "2026-10-21T01:00:00Z",
              redeemed: 9,
            }),
            summary({
              id: "22222222-2222-4222-8222-222222222222",
              number: 2,
              created_at: "2026-10-22T01:00:00Z",
              redeemed: 1,
            }),
          ]),
        ),
    };
    const user = userEvent.setup();
    mount(<AdminCodesPage />);
    await screen.findByText("Batch 1");
    const order = () =>
      screen.getAllByRole("link", { name: /Batch \d/ }).map((a) => a.textContent?.slice(0, 7));
    expect(order()).toEqual(["Batch 2", "Batch 1"]);
    await user.click(screen.getByRole("button", { name: /Urutan menurun/ }));
    expect(order()).toEqual(["Batch 1", "Batch 2"]);
    await user.selectOptions(screen.getByLabelText("Urutkan"), "redeemed");
    await user.click(screen.getByRole("button", { name: /Urutan menaik/ }));
    expect(order()).toEqual(["Batch 1", "Batch 2"]); // tertebus terbanyak dulu
  });

  it("kosong: ajakan membuat batch pertama; tombol Batch baru membuka formulir", async () => {
    routes = { "GET /api/admin/batches": () => new Response("[]") };
    const user = userEvent.setup();
    mount(<AdminCodesPage />);
    expect(await screen.findByText("Belum ada batch")).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: /Batch baru/ })[0]!);
    expect(await screen.findByLabelText("Jumlah kode")).toBeTruthy();
    expect((screen.getByLabelText("Jumlah kode") as HTMLInputElement).value).toBe("10");
    expect((screen.getByLabelText("Kuota pakai per kode") as HTMLInputElement).value).toBe("1");
  });

  it("membuat batch lalu membuka halaman batch itu", async () => {
    routes = {
      "GET /api/admin/batches": () => new Response("[]"),
      "POST /api/admin/codes": () =>
        new Response(
          JSON.stringify([
            {
              id: "c1",
              batch_id: "33333333-3333-4333-8333-333333333333",
              code: "SKR-AAAA-1111",
              kind: "package",
              redeem_before: "2126-01-01T00:00:00Z",
              duration_days: 30,
              check_limit: null,
              recipient_note: null,
              message: "x",
            },
          ]),
          { status: 201 },
        ),
    };
    const user = userEvent.setup();
    mount(<AdminCodesPage />);
    await screen.findByText("Belum ada batch");
    await user.click(screen.getAllByRole("button", { name: /Batch baru/ })[0]!);
    await user.click(await screen.findByRole("button", { name: /^Buat$/ }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/admin/kode/33333333-3333-4333-8333-333333333333"),
    );
  });
});

describe("halaman satu batch", () => {
  beforeEach(() => {
    routes = {
      "GET /api/admin/batches/11111111-1111-4111-8111-111111111111": () =>
        new Response(JSON.stringify(detail())),
    };
  });

  it("judul, ringkasan, kode asli langsung terlihat, kuota, dan status", async () => {
    mount(<BatchDetailPage />);
    expect(await screen.findByRole("heading", { name: "Batch 1" })).toBeTruthy();
    expect(screen.getAllByText(/promo · 10 kode · dibuat/).length).toBeGreaterThan(0);
    expect(screen.getByText("SKR-AAAA-1111")).toBeTruthy();
    expect(screen.getByText("SKR-BBBB-2222")).toBeTruthy();
    expect(screen.getByText("rina@mail.id")).toBeTruthy();
    expect(screen.getAllByText("Tersedia")).toHaveLength(2);
    expect(screen.getAllByText("Dipakai").length).toBeGreaterThan(0);
    expect(screen.getByText("…3333")).toBeTruthy(); // kode lama tanpa salinan
    expect(screen.getByRole("button", { name: "Ekspor CSV" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cabut batch/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Semua batch/ })).toBeTruthy();
  });

  it("pencarian menyaring menurut kode atau email penebus", async () => {
    const user = userEvent.setup();
    mount(<BatchDetailPage />);
    await screen.findByText("SKR-AAAA-1111");
    const box = screen.getByPlaceholderText("Cari kode atau email penebus");
    await user.type(box, "rina");
    expect(screen.queryByText("SKR-AAAA-1111")).toBeNull();
    expect(screen.getByText("SKR-BBBB-2222")).toBeTruthy();
    await user.clear(box);
    await user.type(box, "aaaa");
    expect(screen.getByText("SKR-AAAA-1111")).toBeTruthy();
    expect(screen.queryByText("SKR-BBBB-2222")).toBeNull();
    await user.clear(box);
    await user.type(box, "tidak-ada");
    expect(screen.getByText("Tidak ada kode yang cocok.")).toBeTruthy();
  });

  it("cabut satu kode: konfirmasi dulu, peringatan akses hilang bila sudah dipakai, lalu DELETE", async () => {
    routes["DELETE /api/admin/codes/c2"] = () =>
      new Response(JSON.stringify({ users_affected: 1 }));
    const user = userEvent.setup();
    mount(<BatchDetailPage />);
    const row = (await screen.findByText("SKR-BBBB-2222")).closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Cabut kode" }));
    expect(await screen.findByText(/1 orang sudah memakai kode ini/)).toBeTruthy();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cabut kode" }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/codes/c2"))).toBe(true),
    );
  });

  it("cabut batch: konfirmasi, DELETE batch, lalu kembali ke daftar", async () => {
    routes["DELETE /api/admin/batches/11111111-1111-4111-8111-111111111111"] = () =>
      new Response(JSON.stringify({ codes_deleted: 10, users_affected: 1 }));
    const user = userEvent.setup();
    mount(<BatchDetailPage />);
    await user.click(await screen.findByRole("button", { name: /Cabut batch/ }));
    expect(await screen.findByText(/10 kode dihapus permanen/)).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Cabut batch/ }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/kode"));
  });

  it("kelompok kode lama tidak punya tombol cabut batch", async () => {
    routes["GET /api/admin/batches/11111111-1111-4111-8111-111111111111"] = () =>
      new Response(JSON.stringify({ ...detail(), batch: summary({ number: null, id: "lama" }) }));
    mount(<BatchDetailPage />);
    expect(await screen.findByRole("heading", { name: "Kode lama" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Cabut batch/ })).toBeNull();
  });
});
