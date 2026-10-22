import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../env";

export interface StorageClient {
  /** URL untuk mengunggah langsung dari browser (PUT). File tidak lewat function. */
  createSignedUploadUrl(key: string): Promise<string>;
  download(key: string): Promise<Uint8Array>;
  save(key: string, data: Uint8Array, contentType: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

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

  async remove(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const { error } = await this.files.remove(keys);
    if (error) throw new Error("storage_remove_failed");
  }
}

let cached: StorageClient | undefined;

export function getStorage(): StorageClient {
  cached ??= new SupabaseStorage();
  return cached;
}
