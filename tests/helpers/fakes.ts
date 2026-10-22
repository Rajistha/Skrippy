import type { AuthAdmin, AuthUserRef } from "@/server/integrations/auth-admin";
import type { StorageClient } from "@/server/integrations/storage";

export class FakeStorage implements StorageClient {
  files = new Map<string, Uint8Array>();
  removed: string[] = [];
  modified = new Map<string, Date>();

  async createSignedUploadUrl(key: string): Promise<string> {
    return `https://storage.test/upload/${key}`;
  }
  async download(key: string): Promise<Uint8Array> {
    const data = this.files.get(key);
    if (!data) throw new Error("not_found");
    return data;
  }
  async save(key: string, data: Uint8Array): Promise<void> {
    this.files.set(key, data);
  }
  async remove(keys: string[]): Promise<void> {
    for (const k of keys) {
      this.removed.push(k);
      this.files.delete(k);
    }
  }
  async listObjects() {
    return [...this.files].map(([key, data]) => ({
      key,
      size: data.byteLength,
      modifiedAt: this.modified.get(key) ?? new Date(0),
    }));
  }
  /** Simulasi browser mengunggah ke signed URL. */
  upload(url: string, data: Uint8Array): void {
    this.files.set(url.replace("https://storage.test/upload/", ""), data);
  }
}

export class FakeAuthAdmin implements AuthAdmin {
  users: AuthUserRef[] = [];
  deleted: string[] = [];
  async deleteUser(userId: string): Promise<void> {
    this.deleted.push(userId);
    this.users = this.users.filter((u) => u.id !== userId);
  }
  async listUsers(page: number, perPage: number) {
    const slice = this.users.slice((page - 1) * perPage, page * perPage);
    return { users: slice, done: slice.length < perPage };
  }
}
