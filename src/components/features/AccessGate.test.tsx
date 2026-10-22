// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";
import { AccessGate } from "./AccessGate";

const refresh = vi.fn(async () => undefined);
vi.mock("@/lib/session", () => ({ useSession: () => ({ refresh, me: {}, signOut: vi.fn() }) }));
vi.mock("@/lib/use-owner-whatsapp", () => ({ useOwnerWhatsapp: () => "628123456789" }));

type Call = { url: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let respond: () => Response = () => new Response("{}");

beforeEach(() => {
  calls = [];
  refresh.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : null });
      return respond();
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
      <AccessGate />
    </ToastProvider>,
  );

describe("layar kunci akses", () => {
  it("menjelaskan keadaan dan menyediakan kolom kode serta tombol minta kode", () => {
    mount();
    expect(screen.getByText("Masukkan kode akses")).toBeTruthy();
    expect(screen.getByText(/Halaman lain terbuka setelah kode berhasil dipakai/)).toBeTruthy();
    expect(screen.getByPlaceholderText("SKR-XXXX-XXXX")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Minta kode ke pemilik/ }) as HTMLAnchorElement;
    expect(link.href).toContain("wa.me/628123456789");
  });

  it("kode benar: dikirim, sesi disegarkan sehingga halaman terbuka", async () => {
    respond = () =>
      new Response(
        JSON.stringify({
          profile: { id: "x", email: "a@b.id", full_name: null, avatar_url: null, role: "user" },
          access: {
            state: "package",
            ends_at: null,
            days_left: 30,
            checks_left: null,
            daily_limit: 20,
          },
        }),
      );
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByPlaceholderText("SKR-XXXX-XXXX"), "skrabcdefgh");
    await user.click(screen.getByRole("button", { name: /Pakai kode|Lanjut|Buka|Tukar/i }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({ url: "/api/access/redeem", body: { code: "SKR-ABCD-EFGH" } });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("kode salah: pesan galat tampil dan sesi tidak disegarkan", async () => {
    respond = () =>
      new Response(
        JSON.stringify({
          error: {
            code: "invalid_access_code",
            message: "Kode tidak valid atau sudah tidak berlaku.",
          },
        }),
        {
          status: 400,
        },
      );
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByPlaceholderText("SKR-XXXX-XXXX"), "skrzzzzzzzz");
    await user.click(screen.getByRole("button", { name: /Pakai kode|Lanjut|Buka|Tukar/i }));
    expect(await screen.findByText("Kode tidak valid atau sudah tidak berlaku.")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});
