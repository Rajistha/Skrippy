"use client";

import { AdminGuard } from "@/components/features/AdminGuard";
import { AppShell } from "@/components/features/AppShell";
import { GuidelineEditor } from "@/components/features/GuidelineEditor";
import { t } from "@/lib/i18n/id";

export default function NewGuidelinePage() {
  return (
    <AdminGuard>
      <AppShell
        title={t.guidelines.newTitle}
        description={t.guidelines.newSubtitle}
        back={{ href: "/admin/pedoman", label: t.guidelines.title }}
      >
        <GuidelineEditor />
      </AppShell>
    </AdminGuard>
  );
}
