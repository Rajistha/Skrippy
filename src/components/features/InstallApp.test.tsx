// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";
import { InstallBanner, InstallGuide } from "./InstallApp";

beforeAll(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false, // jsdom: tidak berjalan sebagai aplikasi terpasang
    media: query,
  }));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const mount = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe("pasang aplikasi", () => {
  it("tanpa dialog pasang dari browser: halaman menampilkan langkah manual untuk tiga perangkat", () => {
    mount(<InstallGuide />);
    expect(screen.queryByRole("button", { name: "Pasang aplikasi" })).toBeNull();
    expect(screen.getByText("Android (Chrome)")).toBeTruthy();
    expect(screen.getByText("iPhone dan iPad (Safari)")).toBeTruthy();
    expect(screen.getByText("Komputer (Chrome atau Edge)")).toBeTruthy();
    expect(screen.getByText(/Tambah ke Layar Utama/)).toBeTruthy();
    expect(screen.getByText(/Teks naskahmu tidak ikut disimpan/)).toBeTruthy();
  });

  it("banner di dashboard mengajak lihat caranya, dan bisa ditunda 14 hari", async () => {
    const user = userEvent.setup();
    mount(<InstallBanner />);
    expect(await screen.findByText("Pasang Skrippy di ponselmu")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Lihat caranya" }).getAttribute("href")).toBe(
      "/pasang",
    );
    await user.click(screen.getByRole("button", { name: "Nanti saja" }));
    expect(screen.queryByText("Pasang Skrippy di ponselmu")).toBeNull();
    const until = Number(localStorage.getItem("skrippy-install-snooze"));
    expect(until).toBeGreaterThan(Date.now() + 13 * 24 * 3_600_000);

    cleanup();
    mount(<InstallBanner />); // dibuka lagi: masih tertunda
    expect(screen.queryByText("Pasang Skrippy di ponselmu")).toBeNull();
  });

  it("saat browser siap memasang, tombol Pasang aplikasi memanggil dialog bawaan", async () => {
    const user = userEvent.setup();
    mount(<InstallGuide />);
    const prompt = vi.fn(async () => undefined);
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    await act(async () => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    await user.click(await screen.findByRole("button", { name: "Pasang aplikasi" }));
    expect(prompt).toHaveBeenCalledOnce();
    expect(await screen.findByText("Skrippy terpasang. Cari ikonnya di layar utama.")).toBeTruthy();
    // dialog hanya sekali pakai
    expect(screen.queryByRole("button", { name: "Pasang aplikasi" })).toBeNull();
  });

  it("setelah terpasang, banner hilang dan halaman menyatakan sudah terpasang", async () => {
    mount(<InstallGuide />);
    await act(async () => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(await screen.findByText("Skrippy sudah terpasang")).toBeTruthy();
    cleanup();
    mount(<InstallBanner />);
    expect(screen.queryByText("Pasang Skrippy di ponselmu")).toBeNull();
  });
});
