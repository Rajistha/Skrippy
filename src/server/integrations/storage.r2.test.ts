import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../env", () => ({ getEnv: () => ({}) }));

import { R2Storage } from "./storage";

describe("R2Storage", () => {
  const r2 = new R2Storage({
    accountId: "acc123",
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: "secretsecretsecretsecret",
    bucket: "manuscripts",
  });

  it("membuat presigned PUT berumur 10 menit ke endpoint R2", async () => {
    const url = new URL(await r2.createSignedUploadUrl("u1/doc 1/file.docx"));
    expect(url.host).toBe("acc123.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/manuscripts/u1/doc%201/file.docx");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });

  it("menghapus banyak objek dan mengabaikan 404", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: Request | string, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      calls.push(`${req.method} ${new URL(req.url).pathname}`);
      return new Response(null, { status: calls.length === 1 ? 404 : 204 });
    });
    await r2.remove(["a.docx", "b.docx"]);
    expect(calls).toEqual(["DELETE /manuscripts/a.docx", "DELETE /manuscripts/b.docx"]);
    vi.unstubAllGlobals();
  });
});
