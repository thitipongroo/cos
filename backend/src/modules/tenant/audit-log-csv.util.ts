// Audit-log CSV export serializer — R17.4 / R17.6 (2026-09-15).
// One row per audit_logs row, RFC 4180, CRLF. Cells go through the same CSV-injection escaping as the
// BOQ export (shared/csv/escape-csv.ts): justification, user_agent and metadata are free text, and the
// file is opened in a spreadsheet by an auditor who did not write them.

import { escapeCsv } from '../../shared/csv/escape-csv';
import type { AuditLogRow } from './admin-audit-log.service';

export const AUDIT_CSV_COLUMNS = [
  'occurred_at',
  'log_id',
  'tenant_id',
  'tenant_code',
  'tenant_name',
  'action',
  'resource_type',
  'resource_id',
  'actor_id',
  'actor_email',
  'actor_name',
  'ip_address',
  'user_agent',
  'justification',
  'metadata',
] as const;

export function toAuditLogCsv(rows: AuditLogRow[]): string {
  const lines: string[] = [AUDIT_CSV_COLUMNS.join(',')];
  for (const row of rows) {
    const cells = AUDIT_CSV_COLUMNS.map((column) =>
      // metadata is the only non-scalar column; it is written as its JSON text.
      column === 'metadata' ? JSON.stringify(row.metadata) : row[column],
    );
    lines.push(cells.map(escapeCsv).join(','));
  }
  // CRLF line terminator per RFC 4180.
  return lines.join('\r\n');
}
