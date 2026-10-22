// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeInput } from "@/components/features/CodeInput";
import { Faq } from "@/components/features/Faq";
import { Alert } from "./Alert";
import { ConfirmDialog } from "./ConfirmDialog";
import { Icon } from "./Icon";
import { Menu } from "./Menu";
import { Modal } from "./Modal";
import { ToastProvider, toast } from "./Toast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.classList.remove("modal-open");
});

describe("Icon", () => {
  it("dekoratif disembunyikan dari pembaca layar, bermakna diberi label", () => {
    const { container, rerender } = render(<Icon name="done" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    rerender(<Icon name="done" label="Selesai" />);
    expect(screen.getByRole("img", { name: "Selesai" })).toBeInTheDocument();
  });

  it("bentuk keparahan berbeda satu sama lain (bukan hanya warna)", () => {
    const html = (name: "critical" | "major" | "minor") =>
      render(<Icon name={name} />).container.innerHTML;
    const [c, m, n] = [html("critical"), html("major"), html("minor")];
    expect(new Set([c, m, n]).size).toBe(3);
  });
});

describe("Modal", () => {
  it("terbuka dengan judul, deskripsi, dan menguncilkan gulir latar", () => {
    const { rerender } = render(
      <Modal open={false} onClose={() => {}} title="Judul" description="Penjelasan">
        isi
      </Modal>,
    );
    expect(document.documentElement).not.toHaveClass("modal-open");
    rerender(
      <Modal open onClose={() => {}} title="Judul" description="Penjelasan">
        isi
      </Modal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Judul" });
    expect(dialog).toHaveAccessibleDescription("Penjelasan");
    expect(dialog).toHaveAttribute("open");
    expect(document.documentElement).toHaveClass("modal-open");
    expect(screen.getByText("isi")).toBeInTheDocument();
  });

  it("Esc, tombol tutup, dan klik latar memanggil onClose", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Judul">
        isi
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
    fireEvent.click(dialog); // klik pada elemen dialog = latar
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("klik di dalam konten tidak menutup", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Judul">
        <button>aksi</button>
      </Modal>,
    );
    fireEvent.click(screen.getByRole("button", { name: "aksi" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("tidak bisa ditutup saat dismissible=false", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Judul" dismissible={false}>
        isi
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Tutup" })).not.toBeInTheDocument();
  });
});

describe("ConfirmDialog", () => {
  it("memanggil onConfirm lalu menutup", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        title="Hapus?"
        confirmLabel="Hapus"
        tone="danger"
        onConfirm={onConfirm}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Hapus" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("kegagalan menampilkan pesan dan dialog tetap terbuka", async () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        title="Hapus?"
        confirmLabel="Hapus"
        onConfirm={() => Promise.reject(new Error("Server menolak."))}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Hapus" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Server menolak.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("selama memproses tombol batal nonaktif dan tidak bisa ditutup", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((r) => (finish = r));
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        title="Hapus?"
        confirmLabel="Hapus"
        onConfirm={() => pending}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Hapus" }));
    expect(screen.getByRole("button", { name: "Batal" })).toBeDisabled();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe("Toast", () => {
  it("tampil dengan peran yang sesuai, bisa ditutup, dan hilang otomatis", () => {
    vi.useFakeTimers();
    render(<ToastProvider>isi</ToastProvider>);
    act(() => void toast.success("Berhasil disimpan"));
    act(() => void toast.error("Gagal total", { id: "x" }));
    expect(screen.getByRole("status")).toHaveTextContent("Berhasil disimpan");
    expect(screen.getByRole("alert")).toHaveTextContent("Gagal total");

    act(() => vi.advanceTimersByTime(5100));
    expect(screen.queryByText("Berhasil disimpan")).not.toBeInTheDocument();
    expect(screen.getByText("Gagal total")).toBeInTheDocument(); // kesalahan bertahan lebih lama

    fireEvent.click(screen.getByRole("button", { name: "Tutup" }));
    expect(screen.queryByText("Gagal total")).not.toBeInTheDocument();
  });

  it("id sama menggantikan toast lama dan duration null tidak hilang sendiri", () => {
    vi.useFakeTimers();
    render(<ToastProvider>isi</ToastProvider>);
    act(() => void toast.warning("Koneksi terputus", { id: "net", duration: null }));
    act(() => void toast.warning("Masih terputus", { id: "net", duration: null }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByText("Masih terputus")).toBeInTheDocument();
    act(() => toast.dismiss("net"));
    expect(screen.queryByText("Masih terputus")).not.toBeInTheDocument();
  });

  it("tombol aksi dijalankan lalu toast ditutup", () => {
    const onClick = vi.fn();
    render(<ToastProvider>isi</ToastProvider>);
    act(() => void toast.info("Info", { action: { label: "Urungkan", onClick } }));
    fireEvent.click(screen.getByRole("button", { name: "Urungkan" }));
    expect(onClick).toHaveBeenCalled();
    expect(screen.queryByText("Info")).not.toBeInTheDocument();
  });

  it("maksimal 4 toast tampil sekaligus", () => {
    render(<ToastProvider>isi</ToastProvider>);
    act(() => {
      for (let i = 0; i < 7; i++) toast.info(`pesan ${i}`);
    });
    expect(screen.getAllByRole("status")).toHaveLength(4);
  });
});

describe("Menu", () => {
  const items = [
    { label: "Profil", href: "/profil" },
    { label: "Keluar", onSelect: vi.fn() },
  ];

  it("buka dengan klik, fokus ke item pertama, panah berpindah, Esc menutup dan mengembalikan fokus", async () => {
    render(
      <Menu label="Menu akun" items={items}>
        avatar
      </Menu>,
    );
    const trigger = screen.getByRole("button", { name: "Menu akun" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const [first, second] = screen.getAllByRole("menuitem");
    expect(first).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(second).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(first).toHaveFocus(); // melingkar
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("memilih item menjalankan aksi dan menutup menu; klik di luar menutup", async () => {
    const onSelect = vi.fn();
    render(
      <div>
        <button>luar</button>
        <Menu label="Menu akun" items={[{ label: "Keluar", onSelect }]}>
          avatar
        </Menu>
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Menu akun" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Keluar" }));
    expect(onSelect).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Menu akun" }));
    await userEvent.click(screen.getByRole("button", { name: "luar" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("Alert", () => {
  it("kesalahan memakai role alert, lainnya status", () => {
    const { rerender } = render(<Alert tone="error">gagal</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent("gagal");
    rerender(<Alert tone="info">info</Alert>);
    expect(screen.getByRole("status")).toHaveTextContent("info");
  });
});

describe("CodeInput", () => {
  it("memformat kode, menandai lengkap, dan baru bisa dikirim saat lengkap", async () => {
    const onSubmit = vi.fn();
    render(<CodeInput onSubmit={onSubmit} showHint />);
    const input = screen.getByLabelText("Kode akses");
    const submit = screen.getByRole("button", { name: /Pakai kode/ });
    expect(submit).toBeDisabled();

    await userEvent.type(input, "abcd");
    expect(input).toHaveValue("SKR-ABCD");
    expect(screen.getByText(/8 karakter/)).toBeInTheDocument();
    expect(submit).toBeDisabled();

    await userEvent.type(input, "efgh");
    expect(input).toHaveValue("SKR-ABCD-EFGH");
    expect(screen.getByRole("img", { name: /Format kode benar/ })).toBeInTheDocument();
    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith("SKR-ABCD-EFGH");
  });

  it("tempelan dengan spasi dan huruf kecil dirapikan; error muncul sebagai alert", async () => {
    render(<CodeInput onSubmit={() => {}} error="Kode tidak valid." />);
    const input = screen.getByLabelText("Kode akses");
    await userEvent.click(input);
    await userEvent.paste(" skr abcd efgh ");
    expect(input).toHaveValue("SKR-ABCD-EFGH");
    expect(screen.getByRole("alert")).toHaveTextContent("Kode tidak valid.");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("onChange dipanggil agar pemanggil bisa menghapus error", async () => {
    const onChange = vi.fn();
    render(<CodeInput onSubmit={() => {}} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Kode akses"), "a");
    expect(onChange).toHaveBeenLastCalledWith("SKR-A");
  });
});

describe("Faq", () => {
  it("satu terbuka dalam satu waktu dan aria-expanded mengikuti", async () => {
    render(
      <Faq
        items={[
          { q: "Satu?", a: "Jawaban satu" },
          { q: "Dua?", a: "Jawaban dua" },
        ]}
      />,
    );
    const [one, two] = screen.getAllByRole("button");
    expect(one).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Jawaban satu")).toBeVisible();
    await userEvent.click(two!);
    expect(one).toHaveAttribute("aria-expanded", "false");
    expect(two).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Jawaban dua")).toBeVisible();
    expect(screen.getByText("Jawaban satu")).not.toBeVisible();
  });
});
