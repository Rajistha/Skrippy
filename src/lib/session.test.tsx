// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";
import type { Me } from "@/lib/types";
import { clearOfflineData } from "./pwa";
import { readCachedMe, writeCachedMe } from "./session-cache";
import { SessionProvider, useSession } from "./session";

// Objek router harus stabil seperti di Next sungguhan; objek baru tiap render memicu efek tanpa henti.
const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/dashboard" }));
vi.mock("@/lib/supabase/client", () => ({ supabaseBrowser: vi.fn() }));

const ME: Me = {
  profile: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "a@mail.id",
    full_name: "Ayu",
    avatar_url: null,
    role: "user",
  },
  access: { state: "package", ends_at: null, days_left: 30, checks_left: null, daily_limit: 5 },
} as Me;

function Probe() {
  const { me } = useSession();
  return <p>halo {me.profile.full_name}</p>;
}
const mount = () =>
  render(
    <ToastProvider>
      <SessionProvider>
        <Probe />
      </SessionProvider>
    </ToastProvider>,
  );

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SessionProvider", () => {
  it("tanpa salinan: menunggu /me, lalu menampilkan halaman dan menyimpan salinan", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(ME))),
    );
    mount();
    expect(screen.queryByText("halo Ayu")).toBeNull();
    expect(await screen.findByText("halo Ayu")).toBeTruthy();
    expect(readCachedMe()?.profile.email).toBe("a@mail.id");
  });

  it("dengan salinan: halaman tampil langsung tanpa menunggu /me", async () => {
    writeCachedMe(ME);
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((r) => (resolve = r))),
    );
    mount();
    // /me belum selesai, tetapi halaman sudah tampil
    expect(await screen.findByText("halo Ayu")).toBeTruthy();
    resolve(
      new Response(JSON.stringify({ ...ME, profile: { ...ME.profile, full_name: "Ayu B" } })),
    );
    expect(await screen.findByText("halo Ayu B")).toBeTruthy(); // disegarkan dari server
  });

  it("dengan salinan, jaringan putus: tetap tampil, tanpa layar gagal", async () => {
    writeCachedMe(ME);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    mount();
    expect(await screen.findByText("halo Ayu")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/Tidak bisa terhubung/)).toBeNull();
    expect(screen.getByText("halo Ayu")).toBeTruthy();
  });

  it("tanpa salinan, jaringan putus: tampil layar gagal dengan tombol coba lagi", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    mount();
    expect(await screen.findByText(/Tidak bisa terhubung ke server/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Coba lagi/ })).toBeTruthy();
  });

  it("salinan rusak diabaikan, dan clearOfflineData menghapus salinan", async () => {
    sessionStorage.setItem("skrippy-me", '{"profile":1}');
    expect(readCachedMe()).toBeNull();
    writeCachedMe(ME);
    await clearOfflineData();
    expect(readCachedMe()).toBeNull();
    await waitFor(() => expect(sessionStorage.getItem("skrippy-me")).toBeNull());
  });
});
