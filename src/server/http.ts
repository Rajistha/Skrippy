import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError } from "./errors";

export function json<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

function errorResponse(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Bungkus Route Handler: ubah error bisnis dan validasi menjadi { error: { code, message } }.
 * Error tak terduga dicatat tanpa isinya (hanya nama) dan dijawab 500 generik.
 */
export function route<A extends unknown[]>(handler: (...args: A) => Promise<NextResponse>) {
  return async (...args: A): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof AppError) return errorResponse(e.code, e.message, e.status);
      if (e instanceof ZodError) {
        return errorResponse("validation_error", "Data yang dikirim tidak valid.", 400);
      }
      // Hanya nama dan penyebab dasar (kode dan pesan galat database). Pesan lengkap drizzle memuat
      // parameter query, yang bisa berisi isi naskah, jadi sengaja tidak dicatat.
      const cause = e instanceof Error && e.cause instanceof Error ? e.cause : undefined;
      const code = (cause as { code?: string } | undefined)?.code;
      console.error(
        `unhandled_error name=${e instanceof Error ? e.name : "unknown"}` +
          (cause
            ? ` cause=${cause.name}${code ? ` code=${code}` : ""} detail=${cause.message.slice(0, 200)}`
            : ""),
      );
      return errorResponse("internal_error", "Ada yang tidak beres. Coba lagi sebentar lagi.", 500);
    }
  };
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new AppError("Isi permintaan bukan JSON yang valid.", "validation_error", 400);
  }
  return schema.parse(raw);
}

export function parseId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError("Data tidak ditemukan.", "not_found", 404);
  }
  return value;
}

/** Perbandingan waktu-konstan untuk secret job harian. */
export { timingSafeEqual } from "node:crypto";
