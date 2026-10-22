import type { ReactNode } from "react";
import { Card } from "./Card";
import { Icon, type IconName } from "./Icon";

/**
 * Satu kelompok isian: judul dan penjelasan di kiri, kolom isian di dalam kartu di kanan.
 * Di ponsel menumpuk. Dipakai agar form panjang terbagi per topik, bukan satu daftar rata.
 */
export function FormSection({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:gap-8">
      <div>
        <h2 className="flex items-center gap-2 text-[18px] font-semibold leading-7 text-ink-900">
          {icon && <Icon name={icon} className="text-primary-600" />} {title}
        </h2>
        {description && <p className="mt-1 text-[14px] leading-5 text-ink-500">{description}</p>}
      </div>
      <Card className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</Card>
    </section>
  );
}

/** Baris tombol di akhir form: dipisah garis tipis, rata kanan, tanpa kartu melayang. */
export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-ink-200 pt-6">
      {children}
    </div>
  );
}
