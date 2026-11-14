// Index templates for the three search indexes, and the document projections both the indexer and
// the reindex script write.
//
// WHY A TEMPLATE. Nothing used to define a mapping, so OpenSearch mapped every string dynamically:
// `text` with the STANDARD analyzer plus a `.keyword` sub-field. The standard analyzer does not
// segment Thai — measured on opensearch 2.17.1, "ปูนมาช้า เครนเสีย" becomes the two tokens
// `ปูนมาช้า` and `เครนเสีย`, so a search for `ปูน` finds nothing — and the users write Thai. The
// built-in `thai` analyzer gives `ปูน`, `ช้า`, `เครน`, `เสีย`.
//
// WHY A DYNAMIC TEMPLATE, NOT A FIELD LIST. Every read path filters on `.keyword` sub-fields
// (`tenant_id.keyword`, `project_id.keyword`, `status.keyword`, `project_type.keyword`), which the
// dynamic mapping created. Mapping every string to `text` (thai) + `keyword` keeps exactly that shape
// for every field, present and future, so no filter breaks and a new document field needs no edit
// here.
//
// A TEMPLATE ONLY APPLIES TO AN INDEX CREATED AFTER IT. An existing index keeps its analyzer; the
// reindex script (maintenance/reindex-search.script.ts) builds a new index and moves the name onto
// it as an alias. The patterns end in `*` so they cover those versioned indexes too.

import type { ProjectIndexRow, SiteReportIndexRow, IssueIndexRow } from './search-index.repository';

// The names the read paths query (ProjectService.searchProjects, SiteOpsService.searchSiteReports /
// searchIssues) and the indexer writes. After a reindex each is an alias of a versioned index.
export const PROJECTS_INDEX = 'cos_projects';
export const SITE_REPORTS_INDEX = 'site-reports';
export const SITE_ISSUES_INDEX = 'site-issues';
export const SEARCH_INDEXES = [PROJECTS_INDEX, SITE_REPORTS_INDEX, SITE_ISSUES_INDEX] as const;
export type SearchIndexName = (typeof SEARCH_INDEXES)[number];

/** The dynamic mapping's own `.keyword` limit, kept so the filters behave exactly as before. */
const KEYWORD_IGNORE_ABOVE = 256;

/** `cos-search-<name>`, the template that covers `<name>` and every `<name>-v…` index. */
export function templateNameFor(index: SearchIndexName): string {
  return `cos-search-${index}`;
}

/**
 * `thai` without its stop filter. The built-in `thai` analyzer drops a Thai stopword list that
 * includes everyday site words — ส่ง (deliver), รับ, ออก, เปิด, วัน, ลง, ไม่ — so a one-word search for
 * any of them matched nothing. Same tokenizer and filters otherwise.
 */
export const THAI_ANALYZER = 'cos_thai';

export function indexTemplateFor(index: SearchIndexName): Record<string, unknown> {
  return {
    index_patterns: [`${index}*`],
    // Above the default 0 so a broader template someone adds later does not silently win.
    priority: 100,
    template: {
      settings: {
        analysis: {
          analyzer: {
            [THAI_ANALYZER]: {
              type: 'custom',
              tokenizer: 'thai',
              filter: ['lowercase', 'decimal_digit'],
            },
          },
        },
      },
      mappings: {
        dynamic_templates: [
          {
            strings_thai_text_with_keyword: {
              match_mapping_type: 'string',
              mapping: {
                type: 'text',
                analyzer: THAI_ANALYZER,
                fields: { keyword: { type: 'keyword', ignore_above: KEYWORD_IGNORE_ABOVE } },
              },
            },
          },
        ],
      },
    },
  };
}

/** The subset of the OpenSearch client this module needs (lets the tests pass a stub). */
export interface IndexTemplateClient {
  indices: {
    putIndexTemplate(params: { name: string; body: Record<string, unknown> }): Promise<unknown>;
  };
}

/** Idempotent: PUT replaces a template of the same name. */
export async function ensureSearchIndexTemplates(client: IndexTemplateClient): Promise<void> {
  for (const index of SEARCH_INDEXES) {
    await client.indices.putIndexTemplate({
      name: templateNameFor(index),
      body: indexTemplateFor(index),
    });
  }
}

// ── Versions ───────────────────────────────────────────────────────────────────────────────────
// Every write — the event-driven indexer's and the reindex's — carries the row's last-change time as
// an EXTERNAL version (`version_type: external_gte`), so an older snapshot can never replace a newer
// one, whichever arrives last. Without it the reindex's catch-up pass could overwrite a document the
// live indexer had just written from a later edit. Equal versions overwrite (the same row state).

export const VERSION_TYPE = 'external_gte';

/** A row's change time as an external version: epoch milliseconds. */
export function versionOf(changedAt: Date | string): number {
  const ms = (changedAt instanceof Date ? changedAt : new Date(changedAt)).getTime();
  if (!Number.isFinite(ms)) throw new Error(`not a timestamp: ${String(changedAt)}`);
  return ms;
}

/** True for OpenSearch's answer to an older external version: a newer document is already there. */
export function isVersionConflict(err: unknown): boolean {
  const e = err as { statusCode?: number; meta?: { statusCode?: number }; body?: unknown };
  const status = e?.statusCode ?? e?.meta?.statusCode;
  return status === 409 || /version_conflict_engine_exception/.test(JSON.stringify(e?.body ?? ''));
}

// ── Documents ──────────────────────────────────────────────────────────────────────────────────
// One projection per index, shared by the event-driven indexer and the database reindex, so the two
// can never write different shapes for the same row. Each document is keyed by the row's own id.

export function projectDocument(row: ProjectIndexRow): Record<string, unknown> {
  return {
    tenant_id: row.tenant_id,
    project_code: row.project_code,
    project_name: row.project_name,
    project_type: row.project_type,
    status: row.status,
    updated_at: row.updated_at,
  };
}

export function siteReportDocument(row: SiteReportIndexRow): Record<string, unknown> {
  return {
    report_id: row.report_id,
    project_id: row.project_id,
    tenant_id: row.tenant_id,
    report_date: row.report_date,
    summary: row.summary,
    weather: row.weather,
    blockers: row.blockers,
    submitted_by: row.submitted_by,
    status: row.status,
  };
}

export function issueDocument(row: IssueIndexRow): Record<string, unknown> {
  return {
    issue_id: row.issue_id,
    project_id: row.project_id,
    tenant_id: row.tenant_id,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
  };
}
