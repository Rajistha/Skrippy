// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Issue } from "@/lib/schemas";
import { ManuscriptPreview } from "./ManuscriptPreview";

const PREVIEW = {
  title: "Judul Skripsi",
  version_no: 2,
  paragraphs: [
    { index: 0, text: "BAB I PENDAHULUAN", kind: "heading", align: "center" },
    { index: 1, text: "Paragraf biasa tanpa masalah apa pun.", kind: "body", align: "justify" },
    {
      index: 2,
      text: "Dia mengkaji data dengan cara yang tidak baku.",
      kind: "body",
      align: "justify",
    },
    { index: 3, text: "Kalimat lain yang aman dibaca.", kind: "body", align: "left" },
    { index: 4, text: "Hasil analisis sangat bagus sekali.", kind: "body", align: "left" },
  ],
};

const issue = (id: string, at: number, over: Partial<Issue> = {}): Issue => ({
  id,
  category: "spelling",
  rule_code: "EJA-001",
  severity: "major",
  message: `Masalah ${id}`,
  suggestion: null,
  excerpt: null,
  location: { paragraph_index: at },
  user_status: "open",
  ...over,
});

const ISSUES: Issue[] = [
  issue("a", 2, { excerpt: "tidak baku" }),
  issue("b", 4, { severity: "critical", excerpt: "sangat bagus sekali" }),
  issue("c", 3, { user_status: "ignored" }), // diabaikan: tidak disorot
];

let calls: string[] = [];
beforeEach(() => {
  calls = [];
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(PREVIEW));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (focusIndex: number | null = null, runId = "run-1") =>
  render(
    <ManuscriptPreview
      runId={runId}
      issues={ISSUES}
      open
      focusIndex={focusIndex}
      onClose={() => undefined}
    />,
  );

describe("pratinjau naskah", () => {
  it("menampilkan teks naskah, menyorot kutipan temuan terbuka, dan tidak menyorot yang diabaikan", async () => {
    mount(null, "run-a");
    expect(await screen.findByText("BAB I PENDAHULUAN")).toBeTruthy();
    expect(calls).toEqual(["/api/checks/run-a/preview"]);
    const marks = [...document.querySelectorAll("mark")].map((m) => m.textContent);
    expect(marks).toEqual(["tidak baku", "sangat bagus sekali"]);
    expect(screen.getByText("Masalah a")).toBeTruthy();
    expect(screen.queryByText("Masalah c")).toBeNull();
    expect(screen.getByText("2 paragraf bermasalah")).toBeTruthy();
  });

  it("hanya paragraf bermasalah bisa dipilih, dan tombol berikutnya berpindah antar temuan", async () => {
    const user = userEvent.setup();
    mount(null, "run-b");
    await screen.findByText("BAB I PENDAHULUAN");
    await user.click(screen.getByLabelText("Hanya paragraf bermasalah"));
    expect(screen.queryByText("Paragraf biasa tanpa masalah apa pun.")).toBeNull();
    expect(screen.getByText(/Dia mengkaji data/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Temuan berikutnya" }));
    expect(screen.getByText("Temuan 1 dari 2")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Temuan berikutnya" }));
    expect(screen.getByText("Temuan 2 dari 2")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Temuan berikutnya" }));
    expect(screen.getByText("Temuan 1 dari 2")).toBeTruthy(); // kembali ke awal
    await user.click(screen.getByRole("button", { name: "Temuan sebelumnya" }));
    expect(screen.getByText("Temuan 2 dari 2")).toBeTruthy();
  });

  it("dibuka dari satu temuan: menggulir ke paragraf itu dan memberinya tanda fokus", async () => {
    mount(4, "run-c");
    await screen.findByText("BAB I PENDAHULUAN");
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    const target = document.getElementById("pratinjau-p-4")!;
    expect(target.className).toContain("ring-primary-500");
    expect(within(target).getByText("Masalah b")).toBeTruthy();
  });

  it("memuat dari cache saat dibuka lagi untuk laporan yang sama", async () => {
    const first = mount(null, "run-d");
    await screen.findByText("BAB I PENDAHULUAN");
    first.unmount();
    mount(null, "run-d");
    await screen.findByText("BAB I PENDAHULUAN");
    expect(calls.filter((c) => c.includes("run-d"))).toHaveLength(1);
  });
});
