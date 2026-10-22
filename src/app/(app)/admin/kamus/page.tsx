"use client";

import { AdminGuard } from "@/components/features/AdminGuard";
import { AppShell } from "@/components/features/AppShell";
import { DictionaryAdmin } from "@/components/features/DictionaryAdmin";
import { t } from "@/lib/i18n/id";

export default function AdminDictionaryPage() {
  return (
    <AdminGuard>
      <AppShell title={t.nav.adminDictionary} description={t.dictionary.description}>
        <DictionaryAdmin />
      </AppShell>
    </AdminGuard>
  );
}
