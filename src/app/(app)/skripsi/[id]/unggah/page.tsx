"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/features/AppShell";
import { UploadFlow } from "@/components/features/UploadFlow";
import { t } from "@/lib/i18n/id";

function Inner() {
  const { id } = useParams<{ id: string }>();
  const existing = useSearchParams().get("dokumen") ?? undefined;
  return <UploadFlow thesisId={id} existingDocumentId={existing} />;
}

export default function UploadPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell
      title={t.thesis.upload}
      description={t.pageDesc.upload}
      back={{ href: `/skripsi/${id}`, label: t.nav.theses }}
    >
      <Suspense fallback={null}>
        <Inner />
      </Suspense>
    </AppShell>
  );
}
