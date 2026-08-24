// Export serialisation (ADR-078) — PDPA §31 / GDPR Art. 20 portability format.
//
// The CSV escaping tests are the load-bearing ones. A site report's `summary` routinely contains
// commas and newlines; an unquoted one shifts every later column of that row under the wrong header,
// producing a corrupted answer to a subject-rights request that still opens cleanly in a
// spreadsheet. Silent corruption is worse than a failed export.

import { buildEnvelope, csvField, tableToCsv, toCsvFiles, toJson } from '../data-export.serializer';
import type { CollectedTable } from '../data-export.collector';

const GENERATED = new Date('2026-08-04T10:00:00.000Z');
const USER = 'user-1';

const table = (over: Partial<CollectedTable> = {}): CollectedTable => ({
  table: 'platform.users',
  attributedBy: 'user_id',
  rows: [{ user_id: USER, display_name: 'Somchai' }],
  ...over,
});

describe('csvField (RFC 4180)', () => {
  it('passes a plain value through unquoted', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField(42)).toBe('42');
    expect(csvField(true)).toBe('true');
  });

  it('renders null and undefined as empty, not as the strings "null"/"undefined"', () => {
    // A literal "null" in a pay-rate column is a wrong value, not a missing one.
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('quotes and doubles embedded quotes', () => {
    expect(csvField('he said "stop"')).toBe('"he said ""stop"""');
  });

  it('quotes a value containing a comma', () => {
    expect(csvField('crane down, rebar late')).toBe('"crane down, rebar late"');
  });

  it('quotes a value containing a newline (the field-shifting case)', () => {
    expect(csvField('line one\nline two')).toBe('"line one\nline two"');
    expect(csvField('cr\r\nlf')).toBe('"cr\r\nlf"');
  });

  it('renders a Date as ISO-8601 so the window is unambiguous across locales', () => {
    expect(csvField(new Date('2026-08-04T10:00:00.000Z'))).toBe('2026-08-04T10:00:00.000Z');
  });

  it('serialises an object rather than emitting [object Object]', () => {
    expect(csvField({ a: 1 })).toBe('"{""a"":1}"');
  });
});

describe('tableToCsv', () => {
  it('writes a header row taken from the first row', () => {
    expect(tableToCsv(table())).toBe('user_id,display_name\nuser-1,Somchai\n');
  });

  it('says so explicitly when a table holds nothing', () => {
    // "We hold nothing here" is an answer the subject is entitled to; a zero-byte file does not
    // give it, and is indistinguishable from a broken export.
    const csv = tableToCsv(table({ rows: [] }));
    expect(csv).toContain('no records');
    expect(csv).toContain('platform.users');
    expect(csv).toContain('user_id');
  });

  it('puts a note above an empty table, so the blank explains itself', () => {
    const csv = tableToCsv(
      table({ rows: [], note: 'Not applicable — this account is not linked to a worker profile.' }),
    );
    expect(csv).toContain('no records');
    expect(csv).toContain('# Not applicable');
  });

  it('keeps the note when the table DOES have rows', () => {
    // The issues note qualifies rows that are present — it says which historical ones could not be
    // attributed. Emitting it only for empty tables would drop the caveat exactly when it applies.
    const csv = tableToCsv(table({ note: 'created_by exists only for issues raised after X.' }));
    const lines = csv.split('\n');
    expect(lines[0]).toBe('# created_by exists only for issues raised after X.');
    expect(lines[1]).toBe('user_id,display_name');
    expect(lines[2]).toBe('user-1,Somchai');
  });

  it('hard-wraps a long note instead of emitting one unreadable line', () => {
    // A spreadsheet truncates a single overflowing cell, and the explanation is what would be cut.
    const csv = tableToCsv(table({ rows: [], note: 'word '.repeat(60).trim() }));
    const commentLines = csv.split('\n').filter((l) => l.startsWith('# word'));
    expect(commentLines.length).toBeGreaterThan(1);
    expect(commentLines.every((l) => l.length <= 100)).toBe(true);
  });

  it('keeps columns aligned when a later row has a comma-bearing value', () => {
    const csv = tableToCsv(
      table({
        table: 'site_ops.site_reports',
        rows: [
          { report_id: 'r1', summary: 'ok' },
          { report_id: 'r2', summary: 'crane down, rebar late' },
        ],
      }),
    );
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('report_id,summary');
    expect(lines[2]).toBe('r2,"crane down, rebar late"');
  });
});

describe('buildEnvelope / toJson', () => {
  it('records the window as ISO or null, never as a Date object', () => {
    const env = buildEnvelope({
      userId: USER,
      categories: ['identity'],
      data: { identity: [table()] },
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: null,
      generatedAt: GENERATED,
    });

    expect(env.schema_version).toBe('1.0');
    expect(env.generated_at).toBe('2026-08-04T10:00:00.000Z');
    expect(env.window).toEqual({ from: '2026-01-01T00:00:00.000Z', to: null });
    expect(JSON.parse(toJson(env))).toMatchObject({ subject_user_id: USER });
  });

  it('records an open-ended window from either side', () => {
    // "everything up to a date" is as valid a request as "everything from a date"; both ternaries
    // have to hold or one bound silently disappears from the manifest the subject receives.
    const env = buildEnvelope({
      userId: USER,
      categories: ['identity'],
      data: {},
      from: null,
      to: new Date('2026-06-30T23:59:59.000Z'),
      generatedAt: GENERATED,
    });
    expect(env.window).toEqual({ from: null, to: '2026-06-30T23:59:59.000Z' });
  });

  it('carries attributedBy through to the archive', () => {
    // Without it the subject cannot tell WHY a row is theirs, which is most of the point of §30.
    const env = buildEnvelope({
      userId: USER,
      categories: ['location'],
      data: { location: [table({ table: 'site_ops.issues', attributedBy: 'assigned_to' })] },
      from: null,
      to: null,
      generatedAt: GENERATED,
    });
    expect(toJson(env)).toContain('assigned_to');
  });
});

describe('toCsvFiles', () => {
  it('namespaces by category so the same table under two categories does not collide', () => {
    // platform.users appears under BOTH identity and contact with different columns; a flat
    // filename would let one silently overwrite the other.
    const env = buildEnvelope({
      userId: USER,
      categories: ['identity', 'contact'],
      data: {
        identity: [table({ rows: [{ display_name: 'Somchai' }] })],
        contact: [table({ rows: [{ email: 'a@b.com' }] })],
      },
      from: null,
      to: null,
      generatedAt: GENERATED,
    });

    const files = toCsvFiles(env);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        'identity/platform.users.csv',
        'contact/platform.users.csv',
        'manifest.json',
      ]),
    );
    expect(files['identity/platform.users.csv']).toContain('display_name');
    expect(files['contact/platform.users.csv']).toContain('email');
  });

  it('ships a manifest carrying the metadata a CSV table cannot hold', () => {
    const env = buildEnvelope({
      userId: USER,
      categories: ['identity'],
      data: { identity: [table()] },
      from: null,
      to: null,
      generatedAt: GENERATED,
    });
    const manifest = JSON.parse(toCsvFiles(env)['manifest.json']!) as {
      subject_user_id: string;
      files: string[];
      data?: unknown;
    };
    expect(manifest.subject_user_id).toBe(USER);
    expect(manifest.files).toContain('identity/platform.users.csv');
    // The rows live in the CSVs — duplicating them into the manifest would double the archive.
    expect(manifest.data).toBeUndefined();
  });

  it('collects every note into the manifest, keyed by file', () => {
    // Also present inside each CSV, but finding the caveats otherwise means opening every file —
    // and the caveats are the part a reader is most likely to miss.
    const env = buildEnvelope({
      userId: USER,
      categories: ['identity', 'financial'],
      data: {
        identity: [table()],
        financial: [table({ table: 'workforce.project_workforce', rows: [], note: 'no worker' })],
      },
      from: null,
      to: null,
      generatedAt: GENERATED,
    });
    const manifest = JSON.parse(toCsvFiles(env)['manifest.json']!) as {
      notes: Record<string, string>;
    };

    expect(manifest.notes).toEqual({
      'financial/workforce.project_workforce.csv': 'no worker',
    });
  });

  it('produces only a manifest when nothing was collected', () => {
    const env = buildEnvelope({
      userId: USER,
      categories: [],
      data: {},
      from: null,
      to: null,
      generatedAt: GENERATED,
    });
    expect(Object.keys(toCsvFiles(env))).toEqual(['manifest.json']);
  });
});
