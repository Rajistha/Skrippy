import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "../env";

export type AuthUserRef = { id: string; createdAt: Date };

/** Supabase Admin API (service role). Hanya dipakai server. */
export interface AuthAdmin {
  deleteUser(userId: string): Promise<void>;
  /** Satu halaman pengguna, dari yang terlama. `done` true bila tidak ada halaman berikutnya. */
  listUsers(page: number, perPage: number): Promise<{ users: AuthUserRef[]; done: boolean }>;
}

class SupabaseAuthAdmin implements AuthAdmin {
  private readonly client = createClient(
    getEnv().SUPABASE_URL,
    getEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  async deleteUser(userId: string): Promise<void> {
    const { error } = await this.client.auth.admin.deleteUser(userId);
    if (error && error.status !== 404) throw new Error("auth_delete_user_failed");
  }

  async listUsers(page: number, perPage: number) {
    const { data, error } = await this.client.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error("auth_list_users_failed");
    return {
      users: data.users.map((u) => ({ id: u.id, createdAt: new Date(u.created_at) })),
      done: data.users.length < perPage,
    };
  }
}

let cached: AuthAdmin | undefined;

export function getAuthAdmin(): AuthAdmin {
  cached ??= new SupabaseAuthAdmin();
  return cached;
}
