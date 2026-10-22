// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/Toast";
import type { AiStatusAdmin } from "@/lib/schemas";
import { AiSettings } from "./AiSettings";

const status = (over: Partial<AiStatusAdmin> = {}): AiStatusAdmin => ({
  provider: "anthropic",
  connected_providers: [],
  base_url: "",
  connected: false,
  enabled: false,
  available: false,
  model: "claude-haiku-4-5-20251001",
  key_hint: null,
  daily_limit: 3,
  allow_trial: false,
  ...over,
});

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[] = [];

/** Server palsu untuk /api/admin/ai/*: daftar model berbeda per penyedia, simpan mengembalikan status baru. */
function installFetch(
  modelsFor: (provider: string) => {
    models: Array<{ id: string; label: string }>;
    source: string;
    note: string | null;
  },
) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null;
      calls.push({ url, method: init?.method ?? "GET", body });
      if (url.endsWith("/admin/ai/models"))
        return new Response(JSON.stringify(modelsFor(body!.provider as string)));
      if (url.endsWith("/admin/ai") && init?.method === "PUT") {
        return new Response(
          JSON.stringify(
            status({
              provider: (body!.provider as AiStatusAdmin["provider"]) ?? "anthropic",
              model: body!.model as string,
              base_url: (body!.base_url as string) ?? "",
              connected: true,
              connected_providers: [(body!.provider as AiStatusAdmin["provider"]) ?? "anthropic"],
              enabled: Boolean(body!.enabled),
              available: Boolean(body!.enabled),
              key_hint: "…1234",
            }),
          ),
        );
      }
      return new Response("{}", { status: 404 });
    }),
  );
}

const providerList = (provider: string) =>
  provider === "openai"
    ? {
        models: [
          { id: "gpt-4o-mini", label: "gpt-4o-mini" },
          { id: "gpt-4o", label: "gpt-4o" },
        ],
        source: "provider",
        note: null,
      }
    : provider === "gemini"
      ? {
          models: [{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (gemini-2.5-flash)" }],
          source: "provider",
          note: null,
        }
      : {
          models: [
            { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
            { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
          ],
          source: "fallback",
          note: "Tempel kunci API untuk memuat daftar model langsung dari penyedia. Sementara ini memakai daftar bawaan.",
        };

const mount = (s: AiStatusAdmin) =>
  render(
    <ToastProvider>
      <AiSettings initial={s} />
    </ToastProvider>,
  );

beforeEach(() => installFetch(providerList));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const waitModels = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 700));
  });
};

describe("pengaturan AI multi-penyedia", () => {
  it("awalnya belum terhubung: ada pilihan penyedia, panduan terbuka, dan catatan jelas", async () => {
    mount(status());
    expect(screen.getByText("Belum dihubungkan")).toBeTruthy();
    const select = screen.getByLabelText("Penyedia AI") as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual([
      "anthropic",
      "openai",
      "gemini",
      "openai_compatible",
    ]);
    const guide = screen.getByText(/Cara menghubungkan Anthropic/).closest("details")!;
    expect(guide.open).toBe(true);
    expect(within(guide).getAllByText(/console\.anthropic\.com/).length).toBeGreaterThanOrEqual(1);
    expect(within(guide).getAllByRole("listitem").length).toBeGreaterThanOrEqual(5);
  });

  it("berganti penyedia mengganti panduan, model bawaan, dan memuat daftar model otomatis", async () => {
    const user = userEvent.setup();
    mount(status());
    await waitModels();
    expect(
      calls.some((c) => c.url.endsWith("/admin/ai/models") && c.body!.provider === "anthropic"),
    ).toBe(true);

    await user.selectOptions(screen.getByLabelText("Penyedia AI"), "openai");
    expect(screen.getByText(/Cara menghubungkan OpenAI/)).toBeTruthy();
    await waitModels();
    const model = screen.getByLabelText("Model") as HTMLSelectElement;
    expect(model.value).toBe("gpt-4o-mini"); // model bawaan penyedia baru terpilih otomatis
    expect([...model.options].map((o) => o.value)).toEqual(["gpt-4o-mini", "gpt-4o", "__custom__"]);
    expect(screen.getByText("2 model dimuat langsung dari penyedia.")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Penyedia AI"), "gemini");
    expect(screen.getByText(/Cara menghubungkan Google Gemini/)).toBeTruthy();
    expect(screen.getAllByText(/aistudio\.google\.com/).length).toBeGreaterThanOrEqual(1);
  });

  it("mengetik kunci baru memuat ulang daftar memakai kunci itu; kunci kurang dari 8 karakter tidak dikirim", async () => {
    const user = userEvent.setup();
    mount(status());
    await waitModels();
    const before = calls.filter((c) => c.url.endsWith("/models")).length;
    await user.type(screen.getByLabelText("Kunci API"), "abc");
    await waitModels();
    expect(calls.filter((c) => c.url.endsWith("/models")).length).toBe(before); // belum cukup panjang
    await user.type(screen.getByLabelText("Kunci API"), "defghij");
    await waitModels();
    const last = calls.filter((c) => c.url.endsWith("/models")).at(-1)!;
    expect(last.body).toMatchObject({ provider: "anthropic", api_key: "abcdefghij" });
  });

  it("model di luar daftar bisa diketik sendiri", async () => {
    const user = userEvent.setup();
    mount(status());
    await waitModels();
    await user.selectOptions(screen.getByLabelText("Model"), "__custom__");
    const input = screen.getByRole("textbox", { name: /Ketik nama model sendiri/ });
    await user.clear(input);
    await user.type(input, "claude-eksperimen");
    expect((input as HTMLInputElement).value).toBe("claude-eksperimen");
  });

  it("kompatibel OpenAI: alamat dasar muncul, contoh bisa dipakai, dan simpan mengirim semuanya", async () => {
    const user = userEvent.setup();
    mount(status());
    await user.selectOptions(screen.getByLabelText("Penyedia AI"), "openai_compatible");
    expect(screen.getByLabelText("Alamat dasar API")).toBeTruthy();
    const guide = screen.getByText(/Cara menghubungkan Kompatibel OpenAI/).closest("details")!;
    await user.click(within(guide).getAllByRole("button", { name: "Pakai" })[0]!); // OpenRouter
    expect((screen.getByLabelText("Alamat dasar API") as HTMLInputElement).value).toBe(
      "https://openrouter.ai/api/v1",
    );

    await user.type(screen.getByLabelText("Kunci API"), "kunci-rahasia-123");
    await user.click(screen.getByRole("button", { name: /Simpan/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.body).toMatchObject({
      provider: "openai_compatible",
      api_key: "kunci-rahasia-123",
      base_url: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
    });
  });

  it("validasi sebelum menyimpan: kunci wajib untuk penyedia baru, dan kunci tersimpan tidak ditampilkan", async () => {
    const user = userEvent.setup();
    mount(status());
    await user.click(screen.getByRole("button", { name: /Simpan/ }));
    expect(
      await screen.findByText("Tempel kunci API untuk penyedia ini terlebih dulu."),
    ).toBeTruthy();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);

    cleanup();
    mount(
      status({
        connected: true,
        connected_providers: ["anthropic"],
        key_hint: "…cdef",
        available: true,
        enabled: true,
      }),
    );
    expect(screen.getByText("…cdef")).toBeTruthy();
    expect((screen.getByLabelText("Kunci API") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /Simpan/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.body).not.toHaveProperty("api_key");
  });
});
