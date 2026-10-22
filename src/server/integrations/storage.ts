import "server-only";
import { AwsClient } from "aws4fetch";
import { XMLParser } from "fast-xml-parser";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../env";

export interface StorageClient {
  /** URL untuk mengunggah langsung dari browser (PUT). File tidak lewat function. */
  createSignedUploadUrl(key: string): Promise<string>;
  download(key: string): Promise<Uint8Array>;
  save(key: string, data: Uint8Array, contentType: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
  /** Uji sambungan ke penyimpanan (halaman Sistem admin). Melempar bila gagal. */
  ping?(): Promise<void>;
  readonly bucketName?: string;
  /** Semua objek di bucket (dibatasi LIST_LIMIT), untuk mencari file yatim. */
  listObjects?(): Promise<StoredObject[]>;
}

export type StoredObject = { key: string; size: number; modifiedAt: Date };

/** Batas pemindaian agar tetap muat di satu Vercel Function pada skala puluhan pengguna. */
export const LIST_LIMIT = 20_000;

class SupabaseStorage implements StorageClient {
  private readonly client = createClient(
    getEnv().SUPABASE_URL,
    getEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  private readonly bucket = getEnv().SUPABASE_STORAGE_BUCKET;

  private get files() {
    return this.client.storage.from(this.bucket);
  }

  async createSignedUploadUrl(key: string): Promise<string> {
    const { data, error } = await this.files.createSignedUploadUrl(key);
    if (error || !data) throw new Error("storage_upload_url_failed");
    return data.signedUrl;
  }

  async download(key: string): Promise<Uint8Array> {
    const { data, error } = await this.files.download(key);
    if (error || !data) throw new Error("storage_download_failed");
    return new Uint8Array(await data.arrayBuffer());
  }

  async save(key: string, data: Uint8Array, contentType: string): Promise<void> {
    const { error } = await this.files.upload(key, data, { contentType, upsert: true });
    if (error) throw new Error("storage_upload_failed");
  }

  get bucketName(): string {
    return this.bucket;
  }

  async listObjects(): Promise<StoredObject[]> {
    const out: StoredObject[] = [];
    const folders: string[] = [""];
    while (folders.length > 0 && out.length < LIST_LIMIT) {
      const dir = folders.pop()!;
      for (let offset = 0; out.length < LIST_LIMIT; offset += 1000) {
        const { data, error } = await this.files.list(dir, { limit: 1000, offset });
        if (error) throw new Error("storage_list_failed");
        for (const item of data ?? []) {
          const path = dir ? `${dir}/${item.name}` : item.name;
          // Folder tidak punya id; berkas punya.
          if (!item.id) folders.push(path);
          else
            out.push({
              key: path,
              size: Number((item.metadata as { size?: number } | null)?.size ?? 0),
              modifiedAt: new Date(item.updated_at ?? item.created_at ?? 0),
            });
        }
        if (!data || data.length < 1000) break;
      }
    }
    return out;
  }

  async ping(): Promise<void> {
    const { error } = await this.files.list("", { limit: 1 });
    if (error) throw new Error("storage_ping_failed");
  }

  async remove(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const { error } = await this.files.remove(keys);
    if (error) throw new Error("storage_remove_failed");
  }
}

const SIGNED_URL_TTL_SECONDS = 600;

type ListResult = {
  IsTruncated?: boolean | string;
  NextContinuationToken?: string;
  Contents?: ListItem | ListItem[];
};
type ListItem = { Key: string | number; Size?: number; LastModified?: string };

/** Entitas XML dasar tidak diproses oleh parser (aman dari entity expansion), jadi dipulihkan di sini. */
function decodeXmlKey(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Cloudflare R2 lewat API S3. URL unggah berupa presigned PUT (isi file mentah, tanpa multipart). */
export class R2Storage implements StorageClient {
  private readonly aws: AwsClient;
  private readonly base: string;

  constructor(opts: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  }) {
    this.aws = new AwsClient({
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
      service: "s3",
      region: "auto",
    });
    this.base = `https://${opts.accountId}.r2.cloudflarestorage.com/${opts.bucket}`;
    this.bucketName = opts.bucket;
  }

  private url(key: string): string {
    return `${this.base}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  readonly bucketName: string;

  async listObjects(): Promise<StoredObject[]> {
    const parser = new XMLParser({ processEntities: false });
    const out: StoredObject[] = [];
    let token: string | undefined;
    while (out.length < LIST_LIMIT) {
      const url = new URL(this.base);
      url.searchParams.set("list-type", "2");
      url.searchParams.set("max-keys", "1000");
      if (token) url.searchParams.set("continuation-token", token);
      const res = await this.aws.fetch(url.toString(), { method: "GET" });
      if (!res.ok) throw new Error("storage_list_failed");
      const result = (parser.parse(await res.text()) as { ListBucketResult?: ListResult })
        .ListBucketResult;
      const contents = result?.Contents ?? [];
      for (const c of Array.isArray(contents) ? contents : [contents])
        out.push({
          key: decodeXmlKey(String(c.Key)),
          size: Number(c.Size ?? 0),
          modifiedAt: new Date(String(c.LastModified)),
        });
      if (String(result?.IsTruncated) !== "true" || !result?.NextContinuationToken) break;
      token = String(result.NextContinuationToken);
    }
    return out;
  }

  async ping(): Promise<void> {
    const res = await this.aws.fetch(`${this.base}?list-type=2&max-keys=1`, { method: "GET" });
    if (!res.ok) throw new Error("storage_ping_failed");
  }

  async createSignedUploadUrl(key: string): Promise<string> {
    const target = new URL(this.url(key));
    target.searchParams.set("X-Amz-Expires", String(SIGNED_URL_TTL_SECONDS));
    const signed = await this.aws.sign(target.toString(), {
      method: "PUT",
      aws: { signQuery: true, allHeaders: false },
    });
    return signed.url;
  }

  async download(key: string): Promise<Uint8Array> {
    const res = await this.aws.fetch(this.url(key), { method: "GET" });
    if (!res.ok) throw new Error("storage_download_failed");
    return new Uint8Array(await res.arrayBuffer());
  }

  async save(key: string, data: Uint8Array, contentType: string): Promise<void> {
    const res = await this.aws.fetch(this.url(key), {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: data as BodyInit,
    });
    if (!res.ok) throw new Error("storage_upload_failed");
  }

  async remove(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    // DELETE objek tidak error bila objek sudah tidak ada, jadi aman dijalankan ulang.
    const results = await Promise.all(
      keys.map((key) => this.aws.fetch(this.url(key), { method: "DELETE" })),
    );
    if (results.some((r) => !r.ok && r.status !== 404)) throw new Error("storage_remove_failed");
  }
}

let cached: StorageClient | undefined;

export function getStorage(): StorageClient {
  if (!cached) {
    const env = getEnv();
    cached =
      env.STORAGE_PROVIDER === "r2"
        ? new R2Storage({
            accountId: env.R2_ACCOUNT_ID!,
            accessKeyId: env.R2_ACCESS_KEY_ID!,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
            bucket: env.R2_BUCKET!,
          })
        : new SupabaseStorage();
  }
  return cached;
}
