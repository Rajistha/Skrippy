import "server-only";
import type { AccessStatus as ServiceAccessStatus, Profile } from "./services/access";
import type { CheckIssueRow, CheckRunRow } from "./services/checks";
import type { DocumentWithScore, Thesis } from "./services/theses";
import type {
  AccessStatus,
  CheckRun,
  DocumentItem,
  Issue,
  Me,
  Thesis as ThesisOut,
} from "@/lib/schemas";

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function accessOut(s: ServiceAccessStatus): AccessStatus {
  return {
    state: s.state,
    ends_at: iso(s.endsAt),
    days_left: s.daysLeft,
    checks_left: s.checksLeft,
    daily_limit: s.dailyLimit,
  };
}

export function profileOut(p: Profile): Me["profile"] {
  return {
    id: p.id,
    email: p.email,
    full_name: p.fullName,
    avatar_url: p.avatarUrl,
    role: p.role as "user" | "superadmin",
  };
}

export function thesisOut(t: Thesis): ThesisOut {
  return {
    id: t.id,
    title: t.title,
    guideline_id: t.guidelineId,
    last_activity_at: t.lastActivityAt.toISOString(),
    created_at: t.createdAt.toISOString(),
  };
}

export function documentOut(d: DocumentWithScore): DocumentItem {
  return {
    id: d.id,
    thesis_id: d.thesisId,
    version_no: d.versionNo,
    original_filename: d.originalFilename,
    size_bytes: d.sizeBytes,
    word_count: d.wordCount,
    created_at: d.createdAt.toISOString(),
    latest_score: d.latestScore,
    latest_run_id: d.latestRunId,
  };
}

export function runOut(r: CheckRunRow): CheckRun {
  return {
    id: r.id,
    document_id: r.documentId,
    status: r.status as CheckRun["status"],
    check_types: r.checkTypes,
    score_total: r.scoreTotal === null ? null : Number(r.scoreTotal),
    score_by_category: r.scoreByCategory,
    issue_count: r.issueCount,
    stats: (r.stats as CheckRun["stats"]) ?? null,
    error_code: r.errorCode,
    ai_status: r.aiStatus,
    ai_note: r.aiNote,
    created_at: r.createdAt.toISOString(),
    finished_at: iso(r.finishedAt),
  };
}

export function issueOut(i: CheckIssueRow): Issue {
  return {
    id: i.id,
    category: i.category,
    rule_code: i.ruleCode,
    severity: i.severity as Issue["severity"],
    message: i.message,
    suggestion: i.suggestion,
    excerpt: i.excerpt,
    location: i.location as Issue["location"],
    user_status: i.userStatus as Issue["user_status"],
  };
}
