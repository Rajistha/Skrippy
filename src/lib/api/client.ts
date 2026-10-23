import { t } from "@/lib/i18n/id";
import type {
  AdminGuideline,
  Comparison,
  GrantIn,
  CreatedShare,
  SharedReport,
  ShareLink,
  AiConfigIn,
  AiModelList,
  AiProvider,
  AiStatusAdmin,
  AiUserStatus,
  AdminUser,
  CheckRun,
  CheckType,
  BatchDetail,
  BatchSummary,
  CreateCodesIn,
  CreatedCode,
  Dashboard,
  GuidelineTest,
  GuidelineTestIn,
  ScoreTrendPoint,
  ManuscriptPreview,
  DictionaryEntryOut,
  DictionaryIn,
  IgnoredEntry,
  DocumentItem,
  Guideline,
  GuidelineExtraction,
  GuidelineIn,
  GuidelineUpload,
  Issue,
  Me,
  PublicInfo,
  Summary,
  SystemStatus,
  OrphanScan,
  Thesis,
  ThesisDetail,
  UploadStart,
} from "@/lib/schemas";

type Settings = { values: Record<string, unknown> };
type Ok<T> = { res: T };

/** Peta endpoint -> bentuk request dan response. Nama parameter path mengikuti pemanggil. */
type Paths = {
  "/public/info": { GET: Ok<PublicInfo> };
  "/me": { GET: Ok<Me>; DELETE: Ok<void> };
  "/access/redeem": { POST: Ok<Me> & { body: { code: string } } };
  "/dashboard": { GET: Ok<Dashboard> };
  "/guidelines": { GET: Ok<Guideline[]> };
  "/theses": {
    GET: Ok<Thesis[]>;
    POST: Ok<Thesis> & { body: { title: string; guideline_id: string } };
  };
  "/theses/{thesis_id}": {
    GET: Ok<ThesisDetail> & { path: "thesis_id" };
    DELETE: Ok<void> & { path: "thesis_id" };
  };
  "/theses/{thesis_id}/uploads": {
    POST: Ok<UploadStart> & { path: "thesis_id"; body: { filename: string } };
  };
  "/documents/{document_id}": { DELETE: Ok<void> & { path: "document_id" } };
  "/documents/{document_id}/confirm": { POST: Ok<DocumentItem> & { path: "document_id" } };
  "/documents/{document_id}/checks": {
    POST: Ok<CheckRun> & {
      path: "document_id";
      body: { check_types?: CheckType[] | null; skip_rules?: string[] | null };
    };
  };
  "/checks": { GET: Ok<CheckRun[]> };
  "/checks/{run_id}": { GET: Ok<CheckRun> & { path: "run_id" } };
  "/checks/{run_id}/issues": { GET: Ok<Issue[]> & { path: "run_id" } };
  "/checks/{run_id}/issues/{issue_id}": {
    PATCH: Ok<Issue> & {
      path: "run_id" | "issue_id";
      body: { user_status: "open" | "ignored" | "false_positive" | "done" };
    };
  };
  "/checks/{run_id}/issues/{issue_id}/always": {
    POST: Ok<IgnoredEntry> & { path: "run_id" | "issue_id" };
  };
  "/ignored": { GET: Ok<IgnoredEntry[]> };
  "/ignored/{ignored_id}": { DELETE: Ok<void> & { path: "ignored_id" } };
  "/admin/dictionary": {
    GET: Ok<DictionaryEntryOut[]>;
    POST: Ok<DictionaryEntryOut> & { body: DictionaryIn };
  };
  "/admin/dictionary/{entry_id}": { DELETE: Ok<void> & { path: "entry_id" } };
  "/admin/summary": { GET: Ok<Summary> };
  "/admin/system": { GET: Ok<SystemStatus> };
  "/admin/system/orphans": {
    GET: Ok<OrphanScan>;
    POST: Ok<{ deleted: number; bytes: number }>;
  };
  "/admin/codes": { POST: Ok<CreatedCode[]> & { body: CreateCodesIn } };
  "/admin/batches": { GET: Ok<BatchSummary[]> };
  "/admin/batches/{batch_id}": {
    GET: Ok<BatchDetail> & { path: "batch_id" };
    DELETE: Ok<{ codes_deleted: number; users_affected: number }> & { path: "batch_id" };
  };
  "/admin/codes/{code_id}": { DELETE: Ok<{ users_affected: number }> & { path: "code_id" } };
  "/admin/codes/{code_id}/revoke": { POST: Ok<void> & { path: "code_id" } };
  "/admin/users": { GET: Ok<AdminUser[]> };
  "/admin/users/{user_id}/extend": {
    POST: Ok<void> & { path: "user_id"; body: { days: number; reason: string } };
  };
  "/admin/users/{user_id}": { DELETE: Ok<void> & { path: "user_id" } };
  "/admin/users/{user_id}/grant": { POST: Ok<void> & { path: "user_id"; body: GrantIn } };
  "/admin/users/{user_id}/role": {
    POST: Ok<{ role: "user" | "superadmin" }> & {
      path: "user_id";
      body: { role: "user" | "superadmin" };
    };
  };
  "/admin/users/{user_id}/stop": { POST: Ok<void> & { path: "user_id"; body: { reason: string } } };
  "/admin/guidelines": {
    GET: Ok<AdminGuideline[]>;
    POST: Ok<AdminGuideline> & { body: GuidelineIn };
  };
  "/admin/guidelines/{guideline_id}": {
    GET: Ok<AdminGuideline> & { path: "guideline_id" };
    PUT: Ok<AdminGuideline> & { path: "guideline_id"; body: GuidelineIn };
  };
  "/admin/guidelines/{guideline_id}/status": {
    POST: Ok<AdminGuideline> & {
      path: "guideline_id";
      body: { status: "draft" | "published" | "archived" };
    };
  };
  "/admin/guidelines/upload-url": { POST: Ok<GuidelineUpload> & { body: { filename: string } } };
  "/admin/guidelines/test": { POST: Ok<GuidelineTest> & { body: GuidelineTestIn } };
  "/admin/guidelines/extract": { POST: Ok<GuidelineExtraction> & { body: { path: string } } };
  "/checks/{run_id}/preview": { GET: Ok<ManuscriptPreview> & { path: "run_id" } };
  "/checks/{run_id}/trend": { GET: Ok<ScoreTrendPoint[]> & { path: "run_id" } };
  "/checks/{run_id}/compare": { GET: Ok<Comparison> & { path: "run_id" } };
  "/checks/{run_id}/share": {
    GET: Ok<ShareLink[]> & { path: "run_id" };
    POST: Ok<CreatedShare> & { path: "run_id" };
  };
  "/checks/{run_id}/share/{link_id}": { DELETE: Ok<void> & { path: "run_id" | "link_id" } };
  "/public/share/{token}": { GET: Ok<SharedReport> & { path: "token" } };
  "/ai/status": { GET: Ok<AiUserStatus> };
  "/admin/ai": {
    GET: Ok<AiStatusAdmin>;
    PUT: Ok<AiStatusAdmin> & { body: AiConfigIn };
    DELETE: Ok<AiStatusAdmin>;
  };
  "/admin/ai/models": {
    POST: Ok<AiModelList> & { body: { provider: AiProvider; api_key?: string; base_url?: string } };
  };
  "/admin/ai/test": { POST: Ok<{ ok: boolean; message: string }> };
  "/admin/settings": {
    GET: Ok<Settings>;
    PUT: Ok<Settings> & { body: { values: Record<string, string | number> } };
  };
};

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
type Def<P extends keyof Paths, M extends Method> = M extends keyof Paths[P] ? Paths[P][M] : never;
type ResOf<D> = D extends { res: infer R } ? R : never;

type Options<D> = (D extends { path: infer K extends string }
  ? { params: { path: Record<K, string> } }
  : { params?: undefined }) &
  (D extends { body: infer B } ? { body: B } : { body?: undefined }) & {
    query?: Record<string, string>;
  };

/** Bila tidak ada parameter wajib, opsi boleh dihilangkan. */
type Args<D> =
  Record<string, never> extends Omit<Options<D>, "query">
    ? [opts?: Options<D>]
    : [opts: Options<D>];

export const UNAUTHORIZED_EVENT = "skrippy:unauthorized";

export type ApiResult<T> = { data?: T; error?: unknown; response?: Response };

/**
 * GET yang sama dan masih berjalan dipakai bersama. Efek yang berjalan dua kali (React StrictMode di dev) atau dua
 * komponen yang meminta endpoint sama dalam sekejap tidak lagi menggandakan permintaan ke server. Hasilnya
 * tidak disimpan setelah selesai, jadi data selalu segar. Mutasi mengosongkan daftar ini agar pembacaan
 * sesudah tulis tidak memakai jawaban lama.
 */
const inFlight = new Map<string, Promise<ApiResult<never>>>();

function request(
  method: Method,
  path: string,
  opts: {
    params?: { path?: Record<string, string> };
    body?: unknown;
    query?: Record<string, string>;
  } = {},
): Promise<ApiResult<never>> {
  if (method !== "GET") {
    inFlight.clear();
    return send(method, path, opts);
  }
  const key = `${path}|${JSON.stringify(opts.params ?? null)}|${JSON.stringify(opts.query ?? null)}`;
  const running = inFlight.get(key);
  if (running) return running;
  const started = send(method, path, opts).finally(() => {
    if (inFlight.get(key) === started) inFlight.delete(key);
  });
  inFlight.set(key, started);
  return started;
}

async function send(
  method: Method,
  path: string,
  opts: {
    params?: { path?: Record<string, string> };
    body?: unknown;
    query?: Record<string, string>;
  } = {},
): Promise<ApiResult<never>> {
  let url = path.replace(/\{(\w+)\}/g, (_, k: string) =>
    encodeURIComponent(opts.params?.path?.[k] ?? ""),
  );
  if (opts.query) url += `?${new URLSearchParams(opts.query).toString()}`;

  let response: Response;
  try {
    // Sesi Supabase dikirim lewat cookie (same-origin); tidak ada token yang ditempel manual.
    response = await fetch(`/api${url}`, {
      method,
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    return { error: { error: { code: "network", message: t.errors.network } } };
  }
  // Sesi berakhir di tengah pemakaian: beri tahu SessionProvider agar mengarahkan ke halaman masuk.
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (response.status === 204) return { data: undefined as never, response };
  const payload: unknown = await response.json().catch(() => null);
  return response.ok ? { data: payload as never, response } : { error: payload, response };
}

function make<M extends Method>(method: M) {
  return <P extends keyof Paths>(
    path: P,
    ...args: Args<Def<P, M>>
  ): Promise<ApiResult<ResOf<Def<P, M>>>> =>
    request(method, path, args[0] as Parameters<typeof request>[2]) as Promise<
      ApiResult<ResOf<Def<P, M>>>
    >;
}

export const api = {
  GET: make("GET"),
  POST: make("POST"),
  PATCH: make("PATCH"),
  PUT: make("PUT"),
  DELETE: make("DELETE"),
};

export type ApiError = { code: string; message: string };

/** Bentuk error: { error: { code, message } }. */
export function toApiError(error: unknown): ApiError {
  const e = (error as { error?: Partial<ApiError> } | undefined)?.error;
  if (e?.code && e.message) return { code: e.code, message: e.message };
  return { code: "unknown", message: t.common.genericError };
}
