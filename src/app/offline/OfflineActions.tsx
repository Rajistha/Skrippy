"use client";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { t } from "@/lib/i18n/id";

export function OfflineActions() {
  const o = t.pwa.offline;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button onClick={() => window.location.reload()}>
        <Icon name="refresh" /> {o.retry}
      </Button>
      <ButtonLink href="/riwayat" variant="outline">
        {o.toReports}
      </ButtonLink>
    </div>
  );
}
