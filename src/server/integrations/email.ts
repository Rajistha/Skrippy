import "server-only";

/**
 * Pengiriman email (pengingat akses hampir habis, Fase 2). Opsional: tanpa RESEND_API_KEY dan EMAIL_FROM
 * aplikasi berjalan seperti biasa dan pengingat dilewati. Email hanya berisi tanggal akses dan tautan ke aplikasi,
 * tidak pernah isi naskah.
 */
export type EmailMessage = { to: string; subject: string; text: string };

export interface EmailClient {
  send(message: EmailMessage): Promise<void>;
}

export class ResendClient implements EmailClient {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send({ to, subject, text }: EmailMessage): Promise<void> {
    const res = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [to], subject, text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`email_send_failed status=${res.status}`);
  }
}

/** Null bila email belum dikonfigurasi. */
export function getEmailClient(): EmailClient | null {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  return key && from ? new ResendClient(key, from) : null;
}
