import { afterEach, describe, expect, it, vi } from "vitest";
import { CACHE_PREFIX, clearOfflineData, detectPlatform, isInAppBrowser } from "./pwa";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  ipadAsMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 330.0",
  androidWebview:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UD1A; wv) AppleWebKit/537.36 Version/4.0 Chrome/124.0 Mobile Safari/537.36",
};

describe("deteksi perangkat", () => {
  it("mengenali iPhone, iPad yang menyamar sebagai Mac, Android, dan komputer", () => {
    expect(detectPlatform(UA.iphone)).toBe("ios");
    expect(detectPlatform(UA.ipadAsMac, 5)).toBe("ios");
    expect(detectPlatform(UA.ipadAsMac, 0)).toBe("desktop"); // Mac sungguhan tanpa layar sentuh
    expect(detectPlatform(UA.android)).toBe("android");
    expect(detectPlatform(UA.windows)).toBe("desktop");
  });

  it("mengenali browser dalam aplikasi lain yang tidak bisa memasang PWA", () => {
    expect(isInAppBrowser(UA.instagram)).toBe(true);
    expect(isInAppBrowser(UA.androidWebview)).toBe(true);
    expect(isInAppBrowser(UA.iphone)).toBe(false);
    expect(isInAppBrowser(UA.android)).toBe(false);
  });
});

describe("clearOfflineData", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("hanya menghapus cache milik Skrippy", async () => {
    const deleted: string[] = [];
    vi.stubGlobal("caches", {
      keys: async () => [`${CACHE_PREFIX}api-v1`, `${CACHE_PREFIX}pages-v1`, "cache-orang-lain"],
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    });
    await clearOfflineData();
    expect(deleted.sort()).toEqual([`${CACHE_PREFIX}api-v1`, `${CACHE_PREFIX}pages-v1`]);
  });

  it("tidak melempar error bila penyimpanan diblokir", async () => {
    vi.stubGlobal("caches", {
      keys: async () => {
        throw new Error("SecurityError");
      },
    });
    await expect(clearOfflineData()).resolves.toBeUndefined();
  });
});
