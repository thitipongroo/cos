// Serialise a collected export to the format the subject asked for (ADR-078).
//
// PDPA §31 / GDPR Art. 20 require portability in a "structured, commonly used and machine-readable
// format". JSON is the faithful one — it keeps types and the nesting that says which table a row
// came from. CSV is offered because a spreadsheet is what most people actually open, but a CSV
// cannot hold "several tables with different columns", so the archive becomes ONE file per table.

import type { CollectedData, CollectedTable, ExportCategory } from './data-export.collector';

export interface ExportEnvelope {
  /** Bumped when the payload shape changes, so a consumer can tell which contract it has. */
  schema_version: '1.0';
  generated_at: string;
  subject_user_id: string;
  categories: ExportCategory[];
  window: { from: string | null; to: string | null };
  /**
   * Why each table is in here. A subject-rights artefact that cannot explain WHY a row is attributed
   * to the reader is not much of an answer to "what do you hold about me".
   */
  data: Partial<CollectedData>;
}

export function buildEnvelope(params: {
  userId: string;
  categories: ExportCategory[];
  data: Partial<CollectedData>;
  from: Date | null;
  to: Date | null;
  generatedAt: Date;
}): ExportEnvelope {
  return {
    schema_version: '1.0',
    generated_at: params.generatedAt.toISOString(),
    subject_user_id: params.userId,
    categories: params.categories,
    window: {
      from: params.from ? params.from.toISOString() : null,
      to: params.to ? params.to.toISOString() : null,
    },
    data: params.data,
  };
}

export function toJson(envelope: ExportEnvelope): string {
  return JSON.stringify(envelope, null, 2);
}

/**
 * Escape one CSV field per RFC 4180.
 *
 * Quoting is not cosmetic here: a site report's `summary` routinely contains commas and newlines,
 * and an unquoted one silently shifts every later column of that row into the wrong header — a
 * corrupted answer to a subject-rights request that still looks like a valid file.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

/**
 * Wrap a table's `note` as CSV comment lines.
 *
 * Long notes are hard-wrapped rather than emitted as one enormous line, because a spreadsheet shows
 * a single cell's overflow as truncated text and the explanation would be the part that gets cut.
 */
function noteComment(note: string): string {
  const lines: string[] = [];
  let line = '';
  for (const word of note.split(' ')) {
    if (line && `${line} ${word}`.length > 95) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  // Unconditional: the only caller guards on `table.note` being truthy, so the trailing chunk is
  // always a real line. A `if (line)` guard here would be a branch nothing can take.
  lines.push(line);
  return lines.map((l) => `# ${l}\n`).join('');
}

/**
 * One CSV per table. The header is taken from the FIRST row, so a table with no rows produces a
 * file with a comment rather than a headerless empty file — "we hold nothing here" is itself an
 * answer the subject is entitled to, and a zero-byte file does not say it.
 *
 * A `note` rides above the data, not only above an empty table: the issues note qualifies rows that
 * ARE present, and dropping it whenever the query returned something would hide the caveat exactly
 * when there is data for it to apply to.
 */
export function tableToCsv(table: CollectedTable): string {
  const note = table.note ? noteComment(table.note) : '';
  if (table.rows.length === 0) {
    return `# ${table.table} — no records (attributed by ${table.attributedBy})\n${note}`;
  }
  const headers = Object.keys(table.rows[0]!);
  const lines = [headers.join(',')];
  for (const row of table.rows) {
    lines.push(headers.map((h) => csvField(row[h])).join(','));
  }
  return note + lines.join('\n') + '\n';
}

/** Flatten the whole export to `{ filename: contents }`, one entry per table. */
export function toCsvFiles(envelope: ExportEnvelope): Record<string, string> {
  const files: Record<string, string> = {};
  const notes: Record<string, string> = {};
  for (const [category, tables] of Object.entries(envelope.data) as [
    ExportCategory,
    CollectedTable[],
  ][]) {
    for (const table of tables) {
      // `platform.users` under two categories would collide on filename, so the category prefixes it
      // — identity/platform.users.csv and contact/platform.users.csv hold different columns.
      const name = `${category}/${table.table}.csv`;
      files[name] = tableToCsv(table);
      // Repeated in the manifest as well as inside each CSV. The caveats are the part a reader is
      // most likely to miss, and finding them means opening every file otherwise.
      if (table.note) notes[name] = table.note;
    }
  }
  // The envelope's own metadata has nowhere to live in a CSV table, so it rides alongside.
  files['manifest.json'] = JSON.stringify(
    { ...envelope, data: undefined, files: Object.keys(files), notes },
    null,
    2,
  );
  return files;
}
