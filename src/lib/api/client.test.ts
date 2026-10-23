// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";

let calls: { url: string; method: string }[] = [];
let release: Array<() => void> = [];

beforeEach(() => {
  calls = [];
  release = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          calls.push({ url, method: init?.method ?? "GET" });
          release.push(() => resolve(new Response(JSON.stringify({ n: calls.length }))));
        }),
    ),
  );
});
afterEach(async () => {
  // Selesaikan semua permintaan yang masih menggantung supaya tidak bocor ke tes berikutnya (daftar pemakaian bersama ada di modul).
  release.forEach((r) => r());
  await new Promise((r) => setTimeout(r, 0));
  vi.unstubAllGlobals();
});

describe("klien API: GET yang sedang berjalan dipakai bersama", () => {
  it("dua GET sama bersamaan hanya mengirim satu permintaan dan keduanya mendapat hasil", async () => {
    const a = api.GET("/dashboard");
    const b = api.GET("/dashboard");
    expect(calls).toHaveLength(1);
    release[0]!();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.data).toEqual(rb.data);
    expect(ra.response?.status).toBe(200);
  });

  it("setelah selesai, GET berikutnya mengambil data baru (tidak ada cache)", async () => {
    const first = api.GET("/dashboard");
    release[0]!();
    await first;
    const second = api.GET("/dashboard");
    expect(calls).toHaveLength(2);
    release[1]!();
    expect((await second).data).toEqual({ n: 2 });
  });

  it("endpoint atau parameter berbeda tidak digabung", () => {
    void api.GET("/dashboard");
    void api.GET("/theses");
    void api.GET("/checks/{run_id}", { params: { path: { run_id: "a" } } });
    void api.GET("/checks/{run_id}", { params: { path: { run_id: "b" } } });
    expect(calls).toHaveLength(4);
  });

  it("mutasi memutus pemakaian bersama: GET sesudah tulis selalu mengambil data baru", async () => {
    void api.GET("/dashboard");
    void api.POST("/access/redeem", { body: { code: "SKR-AAAA-BBBB" } });
    void api.GET("/dashboard");
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST", "GET"]);
  });

  it("kegagalan jaringan dikembalikan ke semua peminta dan tidak tersangkut", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const [a, b] = await Promise.all([api.GET("/dashboard"), api.GET("/dashboard")]);
    expect(a.error).toMatchObject({ error: { code: "network" } });
    expect(b.error).toMatchObject({ error: { code: "network" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    expect((await api.GET("/dashboard")).data).toEqual({});
  });
});
