import { beforeEach, describe, expect, it } from "vitest";
import { resetTrialThrottle, shouldCheckTrial, TRIAL_RECHECK_MS } from "./trial-throttle";

beforeEach(resetTrialThrottle);

describe("pembatas pemeriksaan trial", () => {
  it("memeriksa sekali, lalu melewati permintaan berikutnya selama jendela waktu", () => {
    expect(shouldCheckTrial("u1", 1_000)).toBe(true);
    expect(shouldCheckTrial("u1", 1_001)).toBe(false);
    expect(shouldCheckTrial("u1", 1_000 + TRIAL_RECHECK_MS - 1)).toBe(false);
  });

  it("memeriksa lagi setelah jendela waktu lewat", () => {
    expect(shouldCheckTrial("u1", 0)).toBe(true);
    expect(shouldCheckTrial("u1", TRIAL_RECHECK_MS)).toBe(true);
  });

  it("tiap akun dihitung sendiri", () => {
    expect(shouldCheckTrial("u1", 0)).toBe(true);
    expect(shouldCheckTrial("u2", 1)).toBe(true);
    expect(shouldCheckTrial("u1", 2)).toBe(false);
  });

  it("daftar tidak tumbuh tanpa batas", () => {
    for (let i = 0; i < 1500; i++) shouldCheckTrial(`u${i}`, 0);
    // setelah dibersihkan, akun lama diperiksa lagi (aman, hanya sedikit lebih sering)
    expect(shouldCheckTrial("u0", 1)).toBe(true);
  });
});
