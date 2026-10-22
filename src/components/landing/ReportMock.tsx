import { ScoreRing } from "@/components/features/ScoreRing";
import { RuleCode, SeverityBadge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { t } from "@/lib/i18n/id";

const CATEGORIES = [
  { key: "format", score: 90 },
  { key: "structure", score: 76 },
  { key: "spelling", score: 84 },
  { key: "citation", score: 78 },
] as const;

/** Contoh laporan memakai komponen asli aplikasi. Data hanya contoh dan diberi label "Contoh laporan". */
export function ReportMock({ compact = false }: { compact?: boolean }) {
  return (
    <div className="w-full max-w-[460px] rounded-xl bg-surface p-5 text-left shadow-lg ring-1 ring-ink-100">
      <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-50 text-primary-600">
            <Icon name="thesis" />
          </span>
          <div className="min-w-0 leading-5">
            <p className="truncate text-[14px] font-semibold text-ink-900">
              skripsi_bab1_sd_bab5.docx
            </p>
            <p className="text-[12px] text-ink-500">{t.landing.report.sampleLabel}</p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sev-success-bg px-2.5 py-1 text-[12px] font-semibold text-sev-success">
          <Icon name="done" /> {t.status.completed}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-5">
        <ScoreRing value={82} size={96} />
        <ul className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2">
          {CATEGORIES.map((c) => (
            <li key={c.key} className="text-[12px] leading-4">
              <span className="flex items-center justify-between font-medium text-ink-700">
                <span>
                  <Icon name={c.key} /> {t.checks[c.key]}
                </span>
                <span className="font-semibold text-ink-900">{c.score}</span>
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink-100">
                <span
                  className="block h-full rounded-full bg-primary-500"
                  style={{ width: `${c.score}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>

      <ul className="mt-4 flex flex-col gap-2.5">
        <Issue
          severity="critical"
          code="FMT-002"
          message="Margin kiri 3 cm, seharusnya 4 cm."
          where="Bagian 1"
        />
        <Issue
          severity="major"
          code="EJA-001"
          message={'Kata tidak baku "analisa", seharusnya "analisis".'}
          where="Bab II › paragraf 4"
        />
        {!compact && (
          <Issue
            severity="minor"
            code="EJA-003"
            message="Ada spasi ganda."
            where="Bab III › paragraf 2"
          />
        )}
      </ul>
    </div>
  );
}

function Issue({
  severity,
  code,
  message,
  where,
}: {
  severity: "critical" | "major" | "minor";
  code: string;
  message: string;
  where: string;
}) {
  return (
    <li className="rounded-lg bg-canvas p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={severity} />
        <RuleCode code={code} />
      </div>
      <p className="mt-1.5 text-[13px] font-medium leading-5 text-ink-900">{message}</p>
      <p className="mt-0.5 flex items-center gap-1 text-[12px] leading-4 text-ink-500">
        <Icon name="flag" /> {where}
      </p>
    </li>
  );
}
