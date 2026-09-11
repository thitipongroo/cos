// en/th parity, and every key a screen asks for.
//
// Written as a test rather than a one-off script because the failure it catches is invisible: a
// missing key does not throw. `translate()` returns the KEY ITSELF when a message is absent
// (translate.ts), so an untranslated screen renders `transparency.session.param.transport` in the
// middle of a sentence and looks like a rendering glitch rather than a missing translation. Thai is
// the primary field language on this product, so a key that exists only in English is a screen a
// site worker cannot read.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import en from '../en.json';
import th from '../th.json';

type Tree = Record<string, unknown>;

/** Every leaf path in a message tree. */
function leaves(node: Tree, prefix = ''): string[] {
  return Object.entries(node).flatMap(([k, v]) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? leaves(v as Tree, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

const enKeys = new Set(leaves(en as Tree));
const thKeys = new Set(leaves(th as Tree));

describe('en/th parity', () => {
  it('has a Thai message for every English one', () => {
    expect([...enKeys].filter((k) => !thKeys.has(k))).toEqual([]);
  });

  it('has an English message for every Thai one', () => {
    // The other direction matters too: a Thai-only key is a message no fallback can supply, since
    // English is the fallback locale.
    expect([...thKeys].filter((k) => !enKeys.has(k))).toEqual([]);
  });

  it('leaves no message empty in either locale', () => {
    // An empty string passes a "key exists" check and renders as nothing at all — worse than the
    // key itself, which at least looks wrong.
    const empty = (tree: Tree, locale: string) =>
      leaves(tree)
        .filter((k) => {
          const v = k.split('.').reduce<unknown>((o, p) => (o as Tree)?.[p], tree);
          return typeof v === 'string' && v.trim() === '';
        })
        .map((k) => `${locale}:${k}`);
    expect([...empty(en as Tree, 'en'), ...empty(th as Tree, 'th')]).toEqual([]);
  });
});

describe('every static key a screen asks for exists', () => {
  const SRC = join(__dirname, '..', '..');

  /**
   * Only literal `t('…')` calls are checked. Template calls — `t(\`…\${band}\`)` — cannot be resolved
   * statically, and the groups they index (attestation bands, export stages, connection types) are
   * pinned by the unit tests of the modules that produce those values.
   *
   * THE WHOLE OF `src`, NOT THE ROUTES ALONE, since 2026-09-11. This walked `app/(app)/*.tsx` and
   * nothing else, so a key asked for by a COMPONENT was never checked — and `project.select.retry`
   * was in neither catalogue from 2026-08-12 until an Android capture photographed
   * `<SelectProjectSheet />` in its failed state with the raw key printed on the retry button.
   * Every test passed throughout: that key is reached only when the project fetch fails, which no
   * test made happen and the screenshot rig did.
   */
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const here = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(here);
      return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [here] : [];
    });
  }

  it('resolves in both locales', () => {
    const missing: string[] = [];
    for (const file of sources(SRC)) {
      const src = readFileSync(file, 'utf8');
      const where = file.slice(SRC.length + 1);
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        const key = m[1]!;
        if (!enKeys.has(key)) missing.push(`en ${where}: ${key}`);
        if (!thKeys.has(key)) missing.push(`th ${where}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('reads more than the routes, and reaches the file that proved it had to', () => {
    // The guard on the guard: a `sources()` that quietly returned the old set would leave the test
    // above passing for the wrong reason.
    const files = sources(SRC);
    expect(files.length).toBeGreaterThan(readdirSync(join(SRC, 'app', '(app)')).length);
    expect(files.some((f) => f.endsWith('SelectProjectSheet.tsx'))).toBe(true);
  });
});
