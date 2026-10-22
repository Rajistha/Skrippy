"use client";

import { useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { api, toApiError } from "@/lib/api/client";
import { whatsappLink } from "@/lib/format";
import { t } from "@/lib/i18n/id";
import { useSession } from "@/lib/session";
import { useOwnerWhatsapp } from "@/lib/use-owner-whatsapp";
import { CodeInput } from "./CodeInput";

/**
 * Pengganti isi halaman untuk akun yang belum punya akses (trial dimatikan dan belum menukar kode).
 * Halaman lain terkunci sampai kode paket berhasil ditukar.
 */
export function AccessGate() {
  const g = t.gate;
  const { refresh } = useSession();
  const whatsapp = useOwnerWhatsapp(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function redeem(code: string) {
    setLoading(true);
    setError(null);
    const { data, error: err, response } = await api.POST("/access/redeem", { body: { code } });
    setLoading(false);
    if (!data) {
      setError(response?.status === 429 ? t.redeem.rateLimited : toApiError(err).message);
      return;
    }
    toast.success(
      t.toast.redeemed(data.access.state === "package" ? t.access.package : t.access.trial),
    );
    await refresh();
  }

  return (
    <Card className="mx-auto flex w-full max-w-lg flex-col gap-5 py-8 text-center sm:px-8">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-primary-50 text-[28px] text-primary-600">
        <Icon name="lock" />
      </span>
      <div>
        <h2 className="font-display text-[24px] font-bold leading-8 text-ink-900">{g.title}</h2>
        <p className="mt-1 text-[15px] leading-6 text-ink-500">{g.body}</p>
      </div>
      <div className="text-left">
        <CodeInput
          onSubmit={redeem}
          onChange={() => error && setError(null)}
          error={error}
          loading={loading}
          hideLabel
          autoFocus
        />
      </div>
      {whatsapp && (
        <ButtonLink
          external
          variant="outline"
          href={whatsappLink(whatsapp, "Halo, aku mau minta kode akses Skrippy.")}
          className="self-center"
        >
          <Icon name="whatsapp" /> {g.request}
        </ButtonLink>
      )}
    </Card>
  );
}
