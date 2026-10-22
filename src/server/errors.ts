/** Error bisnis. Dipetakan ke { "error": { "code": ..., "message": ... } } oleh Route Handler. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string = "bad_request",
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class InvalidAccessCode extends AppError {
  constructor(message = "Kode tidak valid atau sudah tidak berlaku.") {
    super(message, "invalid_access_code", 400);
  }
}

export class TrialAlreadyUsed extends AppError {
  constructor() {
    super(
      "Kamu sudah pernah memakai trial. Minta kode paket ke pemilik untuk lanjut.",
      "trial_already_used",
      400,
    );
  }
}

export class Unauthenticated extends AppError {
  constructor() {
    super("Sesi tidak valid atau sudah berakhir. Masuk lagi dengan Google.", "invalid_token", 401);
  }
}

export class AccessCodeRequired extends AppError {
  constructor() {
    super(
      "Skrippy khusus undangan. Masukkan kode akses dari pemilik.",
      "access_code_required",
      403,
    );
  }
}

export class AccessDenied extends AppError {
  constructor(message = "Kamu tidak punya izin untuk ini.") {
    super(message, "access_denied", 403);
  }
}

export class CheckNotAllowed extends AppError {
  constructor(message: string, code: string) {
    super(message, code, 403);
  }
}

export class NotFound extends AppError {
  constructor(message = "Data tidak ditemukan.") {
    super(message, "not_found", 404);
  }
}

export class RateLimited extends AppError {
  constructor(message = "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.") {
    super(message, "rate_limited", 429);
  }
}

export class InvalidUpload extends AppError {
  constructor(message: string) {
    super(message, "invalid_upload", 400);
  }
}
