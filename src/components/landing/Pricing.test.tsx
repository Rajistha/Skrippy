// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PublicInfo } from "@/lib/schemas";
import { Pricing } from "./Sections";

const info = (over: Partial<PublicInfo> = {}): PublicInfo => ({
  package_enabled: true,
  package_name: "Paket Skripsi",
  package_price_idr: 25000,
  package_duration_days: 30,
  trial_enabled: true,
  trial_duration_days: 7,
  trial_check_limit: 3,
  whatsapp: "628123456789",
  ...over,
});

afterEach(cleanup);

describe("bagian harga di landing", () => {
  it("trial dan paket menyala: dua kartu", () => {
    render(<Pricing info={info()} />);
    expect(screen.getByText("Trial")).toBeTruthy();
    expect(screen.getByText("Paket Skripsi")).toBeTruthy();
    expect(screen.getByText("Rp25.000")).toBeTruthy();
  });

  it("paket mati: kartu paket dan harga hilang, trial tetap", () => {
    render(<Pricing info={info({ package_enabled: false })} />);
    expect(screen.getByText("Trial")).toBeTruthy();
    expect(screen.queryByText("Paket Skripsi")).toBeNull();
    expect(screen.queryByText("Rp25.000")).toBeNull();
  });

  it("trial mati: hanya kartu paket", () => {
    render(<Pricing info={info({ trial_enabled: false })} />);
    expect(screen.queryByText("Trial")).toBeNull();
    expect(screen.getByText("Paket Skripsi")).toBeTruthy();
  });

  it("keduanya mati: seluruh bagian harga disembunyikan", () => {
    const { container } = render(
      <Pricing info={info({ trial_enabled: false, package_enabled: false })} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
