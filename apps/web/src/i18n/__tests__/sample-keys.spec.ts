/**
 * The 6a076c6d sample pages read their records' descriptive text from `sample.*` keys built from the record id —
 * `t(\`sample.leasing.${asset.id}.type\`)` (fix/web-sample-data-notice). A record added without its keys would
 * show the key itself (`sample.leasing.new-id.type`), and nothing else would fail. This reads each page's source:
 * for every such template it finds, every record in the page's constants that carries that field must have the key
 * in en.json (locales.spec.ts then holds th.json to the same keys).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import en from '../en.json';

type Messages = { [key: string]: string | Messages };

function lookup(messages: Messages, key: string): string | undefined {
  let node: string | Messages | undefined = messages;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

const APP = join(__dirname, '..', '..', 'app', '(app)');
// Page → how many `sample.<ns>.${x.id}.<field>` templates it uses. Counted, so a template that disappears (or
// stops matching the pattern below) fails here instead of leaving its keys unchecked.
const PAGES: Record<string, number> = {
  'leasing/page.tsx': 2, // type, location (each used by the row and the search)
  'leasing/properties/[id]/page.tsx': 0, // unit types: the static-key branch below
  'crm/tenders/[id]/page.tsx': 0, // names only
  'finance/factoring/page.tsx': 1,
  'safety/ai-vision/page.tsx': 4, // zone (feeds and alerts), activeAlert, title, details
  'procurement/contractor-portal/page.tsx': 1,
  'procurement/rfqs/[id]/evaluate/page.tsx': 0, // names and ratings only
  'projects/[id]/digital-twin/page.tsx': 3,
  'sustainability/carbon/page.tsx': 0, // names and registries only
};

/** Each `{ id: '…', … }` record in the page's module-level constants, with the fields it sets. */
function records(source: string): Array<{ id: string; fields: Set<string> }> {
  const out: Array<{ id: string; fields: Set<string> }> = [];
  for (const block of source.split(/\n\s*\{\n/).slice(1)) {
    const body = block.split(/\n\s*\},?\n/)[0] ?? '';
    const id = /^\s*id: '([^']+)'/m.exec(body)?.[1];
    if (!id) continue;
    out.push({ id, fields: new Set([...body.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]!)) });
  }
  return out;
}

describe('sample pages: every sample.* key a record needs exists', () => {
  it.each(Object.entries(PAGES))('%s', (page, templates) => {
    const source = readFileSync(join(APP, page), 'utf8');
    const missing: string[] = [];

    // t(`sample.<ns>.${x.id}.<field>`) — one key per record that carries <field>.
    const found = new Set(
      [...source.matchAll(/`sample\.(\w+)\.\$\{\w+\.id\}\.(\w+)`/g)].map((m) => `${m[1]}.${m[2]}`),
    );
    expect(found.size).toBe(templates);
    for (const template of found) {
      const [ns, field] = template.split('.') as [string, string];
      let checked = 0;
      for (const record of records(source)) {
        if (!record.fields.has(field)) continue;
        checked++;
        const key = `sample.${ns}.${record.id}.${field}`;
        if (!lookup(en as Messages, key)) missing.push(key);
      }
      // A template with no record carrying its field checks nothing: the record parser lost the records.
      expect({ template, checked: checked > 0 }).toEqual({ template, checked: true });
    }
    // t(`sample.leasingProperty.unitType.${…}`) — one key per unit-type value the page assigns
    // (`type: 'gradeA'`, or both branches of `type: cond ? 'a' : 'b'`).
    if (source.includes('sample.leasingProperty.unitType.')) {
      let values = 0;
      for (const [, line] of source.matchAll(/^\s*type: (.+),$/gm)) {
        for (const [, value] of line!.matchAll(/'(\w+)'/g)) {
          values++;
          const key = `sample.leasingProperty.unitType.${value}`;
          if (!lookup(en as Messages, key)) missing.push(key);
        }
      }
      expect(values).toBeGreaterThan(0);
    }
    expect(missing).toEqual([]);
  });

  it('the notice text and the static sample keys exist', () => {
    for (const key of ['sample.notice', 'sample.aiVision.dispatchZones']) {
      expect({ key, found: Boolean(lookup(en as Messages, key)) }).toEqual({ key, found: true });
    }
  });

  it.each(Object.keys(PAGES))('%s shows the sample-data notice', (page) => {
    expect(readFileSync(join(APP, page), 'utf8')).toContain('<SampleDataNotice />');
  });
});
