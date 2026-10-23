import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/** Menjalankan public/sw.js di sandbox dengan cache dan jaringan palsu, lalu mengirim peristiwa fetch. */
function loadWorker(online: { value: boolean }) {
  const stores = new Map<string, Map<string, string>>();
  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, string>();
    stores.set(name, store);
    const keyOf = (r: string | { url: string }) => (typeof r === "string" ? r : r.url);
    return {
      match: async (r: string | { url: string }) => {
        const body = store.get(keyOf(r).replace("https://skrippy.test", ""));
        return body === undefined ? undefined : { ok: true, body };
      },
      put: async (r: { url: string }, res: { body: string }) => {
        store.set(r.url.replace("https://skrippy.test", ""), res.body);
      },
      add: async (path: string) => {
        store.set(path, "OFFLINE-PAGE");
      },
    };
  };
  const handlers: Record<string, (e: unknown) => void> = {};
  const sandbox: Record<string, unknown> = {
    self: {
      addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn),
      location: { origin: "https://skrippy.test" },
      skipWaiting: async () => undefined,
      clients: { claim: async () => undefined },
    },
    caches: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (n: string) => stores.delete(n),
    },
    fetch: async (r: { url: string }) => {
      if (!online.value) throw new TypeError("offline");
      return {
        ok: true,
        redirected: false,
        body: `NETWORK:${r.url.replace("https://skrippy.test", "")}`,
        clone() {
          return this;
        },
      };
    },
    URL,
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(process.cwd(), "public/sw.js"), "utf8"), sandbox);

  const request = (
    path: string,
    init: { method?: string; mode?: string; origin?: string } = {},
  ) => ({
    method: init.method ?? "GET",
    mode: init.mode ?? "cors",
    url: `${init.origin ?? "https://skrippy.test"}${path}`,
  });
  /** Hasil respons service worker, atau null bila permintaan dibiarkan ke browser. */
  async function send(req: ReturnType<typeof request>): Promise<{ body: string } | null | "error"> {
    let responded: Promise<{ body: string }> | undefined;
    handlers.fetch!({
      request: req,
      respondWith: (p: Promise<{ body: string }>) => (responded = p),
    });
    if (!responded) return null;
    return responded.catch(() => "error" as const);
  }
  /** Peristiwa install: menyimpan halaman cadangan /offline. */
  const install = async () => {
    let pending: Promise<unknown> = Promise.resolve();
    handlers.install!({ waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  };
  return { sandbox, stores, send, request, install };
}

const ID = "3f0c1d2e-aaaa-4bbb-8ccc-0123456789ab";

describe("service worker: apa yang boleh disimpan", () => {
  const { sandbox } = loadWorker({ value: true });
  const shouldCacheApi = sandbox.shouldCacheApi as (p: string) => boolean;

  it("menyimpan data baca saja milik pengguna", () => {
    for (const path of [
      "/api/me",
      "/api/dashboard",
      "/api/theses",
      `/api/theses/${ID}`,
      `/api/checks/${ID}`,
      `/api/checks/${ID}/issues`,
      `/api/checks/${ID}/trend`,
    ])
      expect(shouldCacheApi(path), path).toBe(true);
  });

  it("tidak pernah menyimpan teks naskah, unduhan, tautan berbagi, atau API admin", () => {
    for (const path of [
      `/api/checks/${ID}/preview`,
      `/api/checks/${ID}/pdf`,
      `/api/checks/${ID}/fixed`,
      `/api/checks/${ID}/issues-pdf`,
      `/api/checks/${ID}/share`,
      `/api/checks/${ID}/compare`,
      `/api/checks/${ID}/issues/${ID}`,
      "/api/admin/users",
      "/api/shared/abc",
      "/api/access/redeem",
    ])
      expect(shouldCacheApi(path), path).toBe(false);
  });
});

describe("service worker: perilaku fetch", () => {
  it("mengabaikan permintaan selain GET dan permintaan lintas asal", async () => {
    const w = loadWorker({ value: true });
    expect(await w.send(w.request("/api/me", { method: "POST" }))).toBeNull();
    expect(await w.send(w.request("/api/me", { origin: "https://lain.test" }))).toBeNull();
    expect(await w.send(w.request("/api/admin/users"))).toBeNull();
  });

  it("data API: jaringan dulu, salinan terakhir bila offline", async () => {
    const online = { value: true };
    const w = loadWorker(online);
    const path = `/api/checks/${ID}`;
    expect(await w.send(w.request(path))).toMatchObject({ body: `NETWORK:${path}` });
    online.value = false;
    expect(await w.send(w.request(path))).toMatchObject({ body: `NETWORK:${path}` }); // dari cache
    expect(await w.send(w.request(`/api/checks/${ID}/issues`))).toBe("error"); // belum pernah dibuka
  });

  it("halaman aplikasi disalin, halaman masuk dan admin tidak", async () => {
    const online = { value: true };
    const w = loadWorker(online);
    await w.send(w.request(`/laporan/${ID}`, { mode: "navigate" }));
    await w.send(w.request("/masuk?kode=SKR-ABCD-EFGH", { mode: "navigate" }));
    await w.send(w.request("/admin/pengguna", { mode: "navigate" }));
    await w.send(w.request("/auth/callback?code=rahasia", { mode: "navigate" }));
    const cached = [...(w.stores.get("skrippy-pages-v1")?.keys() ?? [])];
    expect(cached).toEqual([`/laporan/${ID}`]);
  });

  it("navigasi offline: halaman yang pernah dibuka tampil, sisanya halaman /offline", async () => {
    const online = { value: true };
    const w = loadWorker(online);
    await w.install();
    await w.send(w.request("/riwayat", { mode: "navigate" }));
    online.value = false;
    expect(await w.send(w.request("/riwayat", { mode: "navigate" }))).toMatchObject({
      body: "NETWORK:/riwayat",
    });
    expect(await w.send(w.request("/skripsi", { mode: "navigate" }))).toMatchObject({
      body: "OFFLINE-PAGE",
    });
  });

  it("berkas statis berhash memakai cache-first", async () => {
    const online = { value: true };
    const w = loadWorker(online);
    const path = "/_next/static/chunks/app.abc123.js";
    await w.send(w.request(path));
    online.value = false;
    expect(await w.send(w.request(path))).toMatchObject({ body: `NETWORK:${path}` });
  });
});
